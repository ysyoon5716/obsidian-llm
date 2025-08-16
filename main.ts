import { App, Editor, FuzzySuggestModal, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Vault } from 'obsidian';
import OpenAI from 'openai';

// Remember to rename these classes and interfaces!

interface LLMSettings {
	apiKey: string;
	promptFolder: string;
	modelName: string;
}

const DEFAULT_SETTINGS: LLMSettings = {
	apiKey: '',
	promptFolder: '_prompt',
	modelName: 'gpt-5-nano',
}

export class PromptModal extends FuzzySuggestModal<string> {
	plugin: LLMPlugin;
	withFile: boolean;

	constructor(app: App, plugin: LLMPlugin, withFile: boolean) {
		super(app);
		this.plugin = plugin;;
		this.withFile = withFile;
	}

	getItems(): string[] {
		const promptFolder = this.plugin.app.vault.getFolderByPath(this.plugin.settings.promptFolder);
		if (!promptFolder) {
			new Notice('Prompt folder not found');
			return [];
		}
		
		const prompts: string[] = [];
		Vault.recurseChildren(promptFolder, (file) => {
			if (file.name.endsWith('.md')) {
				prompts.push(file.name.replace('.md', ''));
			}
		});
		console.log('prompts', prompts);
		return prompts;
	}

	getItemText(item: string): string {
		return item;
	}

	async onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): Promise<void> {
		console.log('chosen item', item);
		const promptFile = this.plugin.app.vault.getFileByPath(`${this.plugin.settings.promptFolder}/${item}.md`);
		if (!promptFile) {
			new Notice('Prompt file not found');
			return;
		}
		let prompt = await this.plugin.app.vault.read(promptFile);

		const activeFile = this.app.workspace.getActiveFile()!;
		const title = activeFile.basename!;
		const cache = this.app.metadataCache.getFileCache(activeFile);
		const frontmatter = cache?.frontmatter!;
		
		prompt = prompt.replace('{title}', title);
		console.log('prompt', prompt);
		
		const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor!;
		const cursor = editor.getCursor();
		let from = {line: cursor.line, ch: cursor.ch};
		console.log(cursor);
		
		const loadingNotice = new Notice('Generating response...', 0);

		const client = new OpenAI({
			apiKey: this.plugin.settings.apiKey,
			dangerouslyAllowBrowser: true,
		});

		let response;
		if (this.withFile) {
			response = await client.responses.create({
				model: this.plugin.settings.modelName,
				input: [
					{
						role: 'user',
						content: [
							
							{type: 'input_file', file_url: frontmatter.url},
							{type: 'input_text', text: prompt},
						]
					},
				],
			});
			
		} else {
			response = await client.responses.create({
				model: this.plugin.settings.modelName,
				input: prompt,
			});
		}

		console.log('response', response);
		loadingNotice.hide();
		editor.replaceRange(response.output_text, from);
		
	}
}

export default class LLMPlugin extends Plugin {
	settings: LLMSettings;

	async onload() {
		console.log('loading LLM plugin');
		await this.loadSettings();
		console.log('loaded settings');
		this.addSettingTab(new LLMSettingTab(this.app, this));

		this.addCommand({
			id: 'generate-text',
			name: 'Generate Text',
			callback: () => {
				console.log('generating text');
				const modal = new PromptModal(this.app, this, false);
				modal.open();
			}
		});

		this.addCommand({
			id: 'generate-text-with-file',
			name: 'Generate Text with File',
			callback: () => {
				console.log('generating text with file');
				const modal = new PromptModal(this.app, this, true);
				modal.open();
			}
		})
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		console.log('saved settings');
	}
}


class LLMSettingTab extends PluginSettingTab {
	plugin: LLMPlugin;

	constructor(app: App, plugin: LLMPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('OPENAI_API_KEY')
			.setDesc('The API key to use for the LLM')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('The model to use for the LLM')
			.addText(text => text
				.setPlaceholder('Enter the model name')
				.setValue(this.plugin.settings.modelName)
				.onChange(async (value) => {
					this.plugin.settings.modelName = value;
					await this.plugin.saveSettings();
				}));
	}
}