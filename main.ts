import { App, Editor, FuzzySuggestModal, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Vault } from 'obsidian';
import OpenAI from 'openai';
import {GoogleGenAI} from '@google/genai';


interface LLMSettings {
	apiKey: string;
	promptFolder: string;
	modelName: string;
}

const DEFAULT_SETTINGS: LLMSettings = {
	apiKey: '',
	promptFolder: '_prompt',
	modelName: 'gemini-2.5-flash',
}


export class PromptModal extends FuzzySuggestModal<string> {
	plugin: LLMPlugin;

	constructor(app: App, plugin: LLMPlugin) {
		super(app);
		this.plugin = plugin;;
	}

	getItems(): string[] {
		const promptFolder = this.plugin.app.vault.getFolderByPath(this.plugin.settings.promptFolder)!;
		
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
		const promptFile = this.plugin.app.vault.getFileByPath(`${this.plugin.settings.promptFolder}/${item}.md`)!;
		
		let prompt = await this.plugin.app.vault.read(promptFile);

		const activeFile = this.app.workspace.getActiveFile()!;
		const title = activeFile.basename!;		
		
		prompt = prompt.replace('{title}', title);
		console.log('prompt: ', prompt);

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			return
		}

		const editor = view.editor;
		const cursor = editor.getCursor();
		let from = {line: cursor.line, ch: cursor.ch};
		console.log(cursor);
	
		const loadingNotice = new Notice('Generating response...', 0);

		const response = await this.plugin.client.models.generateContent({
			model: this.plugin.settings.modelName,
			contents: prompt,
		  });

		if (response.text) {
			loadingNotice.hide();
			console.log('response: ', response.text);
			editor.replaceRange(response.text, from);
		}
	}
}

export default class LLMPlugin extends Plugin {
	client: GoogleGenAI
	settings: LLMSettings;

	async onload() {
		await this.loadSettings();
	
		this.addSettingTab(new LLMSettingTab(this.app, this));

		this.addCommand({
			id: 'generate-text',
			name: 'Generate Text',
			callback: () => {
				console.log('generating text');
				const modal = new PromptModal(this.app, this);
				modal.open();
			}
		});

		this.addCommand({
			id: 'generate-text-with-file',
			name: 'Generate Text with File',
			callback: () => {
				console.log('generating text with file');
				const modal = new PromptModal(this.app, this);
				modal.open();
			}
		})

		this.client = new GoogleGenAI({apiKey: this.settings.apiKey});
		console.log('client is loaded');
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