const { Plugin, Notice, Editor, MarkdownView, Setting, PluginSettingTab } = require('obsidian');

class SmartIndentPlugin extends Plugin {
    // 插件状态
    isIndented = false;
    shouldIgnoreHeaders = true;
    shouldIgnoreLists = true;
    shouldIgnoreTables = true;
    shouldIgnoreCode = true;
    shouldIgnoreQuotes = true;
    shouldPreserveListIndent = true; // 保护列表缩进
    indentChar = '　　'; // 默认使用2个全角空格
    
    async onload() {
        console.log('Smart Indent Plugin loaded');
        
        // 添加命令
        this.addCommand({
            id: 'toggle-first-line-indent',
            name: '切换全文首行缩进',
            callback: () => this.toggleFirstLineIndent(),
        });
        
        this.addCommand({
            id: 'add-first-line-indent',
            name: '添加全文首行缩进',
            callback: () => this.addFirstLineIndent(),
        });
        
        this.addCommand({
            id: 'remove-first-line-indent',
            name: '移除全文首行缩进',
            callback: () => this.removeFirstLineIndent(),
        });
        
        // 新增：只对选中文字调整缩进
        this.addCommand({
            id: 'toggle-selected-indent',
            name: '切换选中文字首行缩进',
            callback: () => this.toggleSelectedIndent(),
        });
        
        this.addCommand({
            id: 'add-selected-indent',
            name: '添加选中文字首行缩进',
            callback: () => this.addSelectedIndent(),
        });
        
        this.addCommand({
            id: 'remove-selected-indent',
            name: '移除选中文字首行缩进',
            callback: () => this.removeSelectedIndent(),
        });
        
        // 注册设置选项卡
        this.addSettingTab(new SmartIndentSettingTab(this.app, this));
        
        // 加载保存的设置
        await this.loadSettings();
        
        console.log('Smart Indent Plugin initialized successfully');
    }
    
    onunload() {
        console.log('Smart Indent Plugin unloaded');
    }
    
    // 加载设置
    async loadSettings() {
        const settings = await this.loadData();
        if (settings) {
            this.shouldIgnoreHeaders = settings.shouldIgnoreHeaders ?? true;
            this.shouldIgnoreLists = settings.shouldIgnoreLists ?? true;
            this.shouldIgnoreTables = settings.shouldIgnoreTables ?? true;
            this.shouldIgnoreCode = settings.shouldIgnoreCode ?? true;
            this.shouldIgnoreQuotes = settings.shouldIgnoreQuotes ?? true;
            this.shouldPreserveListIndent = settings.shouldPreserveListIndent ?? true;
            this.indentChar = settings.indentChar ?? '　　';
        }
    }
    
    // 保存设置
    async saveSettings() {
        await this.saveData({
            shouldIgnoreHeaders: this.shouldIgnoreHeaders,
            shouldIgnoreLists: this.shouldIgnoreLists,
            shouldIgnoreTables: this.shouldIgnoreTables,
            shouldIgnoreCode: this.shouldIgnoreCode,
            shouldIgnoreQuotes: this.shouldIgnoreQuotes,
            shouldPreserveListIndent: this.shouldPreserveListIndent,
            indentChar: this.indentChar
        });
    }
    
    // 获取当前编辑器内容
    getEditorContent() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !(activeView.editor)) {
            new Notice('❌ 请在Markdown编辑器中使用此功能');
            return null;
        }
        return {
            view: activeView,
            editor: activeView.editor,
            content: activeView.editor.getValue(),
            selection: activeView.editor.getSelection()
        };
    }
    
    // 获取智能首行缩进正则表达式
    getSmartIndentRegex() {
        const exclusions = [];
        
        // 1. 标题
        if (this.shouldIgnoreHeaders) {
            exclusions.push('#+\\s'); // # 标题
        }
        
        // 2. 列表
        if (this.shouldIgnoreLists) {
            // 有序列表：数字 + 点 + 空格
            exclusions.push('\\d+\\.\\s');
            // 无序列表：- * + 后跟空格
            exclusions.push('[\\-\\*\\+]\\s');
            // 引用：> 后跟空格
            exclusions.push('>\\s');
            
            // 保护多层级列表的缩进
            if (this.shouldPreserveListIndent) {
                // 匹配子层级列表（缩进2-4个空格 + 列表标记）
                exclusions.push('\\s{2,4}\\d+\\.\\s');    // 缩进的有序列表
                exclusions.push('\\s{2,4}[\\-\\*\\+]\\s'); // 缩进的无序列表
                exclusions.push('\\s{2,4}>\\s');          // 缩进的引用
            }
        }
        
        // 3. 表格
        if (this.shouldIgnoreTables) {
            exclusions.push('\\|[^|]*\\|'); // 表格行
        }
        
        // 4. 代码块
        if (this.shouldIgnoreCode) {
            exclusions.push('```');           // 代码块标记
            exclusions.push('\\s{4}');        // 4个空格开头的代码
        }
        
        // 5. 引用
        if (this.shouldIgnoreQuotes) {
            exclusions.push('>\\s'); // 引用
        }
        
        // 6. 其他排除项
        exclusions.push('[\\-\\*]{3,}');     // 分隔线 --- ***
        exclusions.push('^\\s*$');           // 空行
        exclusions.push('<[^>]+>');          // HTML标签
        exclusions.push('^\\s*!\\[');        // 图片 ![]
        exclusions.push('^\\s*\\[.*?\\]:');  // 链接定义 [name]:
        exclusions.push('^\\s*:::');         // Callout标记 :::
        
        const exclusionPattern = exclusions.join('|');
        return new RegExp(`^(?!\\s*(?:${exclusionPattern}))`, 'mg');
    }
    
    // 智能清理现有缩进（保留列表缩进）
    cleanExistingIndent(text) {
        if (this.shouldPreserveListIndent) {
            // 保护列表缩进：只清理非列表行的缩进
            return text.replace(/^(?!(\s*(?:\d+\.|\-|\*|\+|>|```|:::|<[^>]+>|\|[^|]*\||[\-\*]{3,}|\s*$)))([‌‌‌‌　\s]+)/mg, '');
        } else {
            // 不保护列表缩进：清理所有行的缩进
            return text.replace(/^[‌‌‌‌　\s]+/mg, '');
        }
    }
    
    // 智能添加首行缩进（保护多层级列表）
    addSmartIndent(text) {
        const lines = text.split('\n');
        const processedLines = [];
        
        for (const line of lines) {
            // 跳过空行
            if (/^\s*$/.test(line)) {
                processedLines.push(line);
                continue;
            }
            
            // 检查是否是列表行（包括子层级）
            const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                              /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                              /^\s*>/.test(line);
            
            // 检查是否是其他需要排除的格式
            const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                              /^\s{4}/.test(line); // 代码行
            
            if (!isListItem && !isExcluded) {
                // 不是列表、不是排除格式、不是代码行，添加缩进
                processedLines.push(this.indentChar + line.trimStart());
            } else {
                // 保持原样：列表、排除格式、代码行
                processedLines.push(line);
            }
        }
        
        return processedLines.join('\n');
    }
    
    // 智能移除首行缩进（保护多层级列表）
    removeSmartIndent(text) {
        const lines = text.split('\n');
        const processedLines = [];
        
        for (const line of lines) {
            // 检查是否是普通段落（非列表、非排除格式）
            const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                              /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                              /^\s*>/.test(line);
            
            const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                              /^\s{4}/.test(line);
            
            if (!isListItem && !isExcluded) {
                // 是普通段落，移除首行缩进
                processedLines.push(line.replace(/^[‌‌‌‌　\s]+/, ''));
            } else {
                // 保持原样：列表、排除格式
                processedLines.push(line);
            }
        }
        
        return processedLines.join('\n');
    }
    
    // ===== 全文处理方法 =====
    
    // 添加全文首行缩进
    addFirstLineIndent() {
        const editorInfo = this.getEditorContent();
        if (!editorInfo) return;
        
        try {
            let content = editorInfo.content;
            
            // 清理现有缩进
            content = this.cleanExistingIndent(content);
            
            // 应用智能缩进
            content = this.addSmartIndent(content);
            
            // 应用更改
            editorInfo.editor.setValue(content);
            this.isIndented = true;
            
            new Notice(`✅ 全文首行缩进已添加`);
            console.log('全文首行缩进添加成功');
            
        } catch (error) {
            console.error('添加全文首行缩进时出错:', error);
            new Notice('❌ 添加全文首行缩进时出错，请查看控制台');
        }
    }
    
    // 移除全文首行缩进
    removeFirstLineIndent() {
        const editorInfo = this.getEditorContent();
        if (!editorInfo) return;
        
        try {
            let content = editorInfo.content;
            
            // 智能移除缩进
            content = this.removeSmartIndent(content);
            
            // 应用更改
            editorInfo.editor.setValue(content);
            this.isIndented = false;
            
            new Notice('✅ 全文首行缩进已移除');
            console.log('全文首行缩进移除成功');
            
        } catch (error) {
            console.error('移除全文首行缩进时出错:', error);
            new Notice('❌ 移除全文首行缩进时出错，请查看控制台');
        }
    }
    
    // 切换全文首行缩进
    toggleFirstLineIndent() {
        if (this.isIndented) {
            this.removeFirstLineIndent();
        } else {
            this.addFirstLineIndent();
        }
    }
    
    // ===== 选中文字处理方法（新增）=====
    
    // 添加选中文字首行缩进
    addSelectedIndent() {
        const editorInfo = this.getEditorContent();
        if (!editorInfo) return;
        
        const selection = editorInfo.editor.getSelection();
        if (!selection || selection.trim() === '') {
            new Notice('❌ 请先选中要缩进的文本');
            return;
        }
        
        try {
            // 获取选中范围
            const selectionRange = editorInfo.editor.listSelections()[0];
            const fromLine = selectionRange.anchor.line;
            const toLine = selectionRange.head.line;
            
            // 按行分割选中内容
            const selectedLines = selection.split('\n');
            const processedLines = [];
            
            // 处理选中的每一行
            for (const line of selectedLines) {
                if (/^\s*$/.test(line)) {
                    processedLines.push(line); // 空行保持不变
                    continue;
                }
                
                // 检查是否是列表行
                const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                                  /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                                  /^\s*>/.test(line);
                
                // 检查是否是排除格式
                const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                                  /^\s{4}/.test(line);
                
                if (!isListItem && !isExcluded) {
                    // 普通段落，添加缩进
                    processedLines.push(this.indentChar + line.trimStart());
                } else {
                    // 列表或排除格式，保持原样
                    processedLines.push(line);
                }
            }
            
            // 重新组合处理后的内容
            const processedSelection = processedLines.join('\n');
            
            // 替换选中内容
            editorInfo.editor.replaceSelection(processedSelection);
            
            new Notice(`✅ 选中文字首行缩进已添加（${selectedLines.length}行）`);
            console.log('选中文字首行缩进添加成功');
            
        } catch (error) {
            console.error('添加选中文字首行缩进时出错:', error);
            new Notice('❌ 添加选中文字首行缩进时出错，请查看控制台');
        }
    }
    
    // 移除选中文字首行缩进
    removeSelectedIndent() {
        const editorInfo = this.getEditorContent();
        if (!editorInfo) return;
        
        const selection = editorInfo.editor.getSelection();
        if (!selection || selection.trim() === '') {
            new Notice('❌ 请先选中要移除缩进的文本');
            return;
        }
        
        try {
            // 按行分割选中内容
            const selectedLines = selection.split('\n');
            const processedLines = [];
            
            for (const line of selectedLines) {
                if (/^\s*$/.test(line)) {
                    processedLines.push(line); // 空行保持不变
                    continue;
                }
                
                // 检查是否是列表行
                const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                                  /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                                  /^\s*>/.test(line);
                
                // 检查是否是排除格式
                const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                                  /^\s{4}/.test(line);
                
                if (!isListItem && !isExcluded) {
                    // 普通段落，移除缩进
                    processedLines.push(line.replace(/^[‌‌‌‌　\s]+/, ''));
                } else {
                    // 列表或排除格式，保持原样
                    processedLines.push(line);
                }
            }
            
            // 重新组合处理后的内容
            const processedSelection = processedLines.join('\n');
            
            // 替换选中内容
            editorInfo.editor.replaceSelection(processedSelection);
            
            new Notice(`✅ 选中文字首行缩进已移除（${selectedLines.length}行）`);
            console.log('选中文字首行缩进移除成功');
            
        } catch (error) {
            console.error('移除选中文字首行缩进时出错:', error);
            new Notice('❌ 移除选中文字首行缩进时出错，请查看控制台');
        }
    }
    
    // 切换选中文字首行缩进
    toggleSelectedIndent() {
        const editorInfo = this.getEditorContent();
        if (!editorInfo) return;
        
        const selection = editorInfo.editor.getSelection();
        if (!selection || selection.trim() === '') {
            new Notice('❌ 请先选中要处理的文本');
            return;
        }
        
        // 智能判断：如果选中的第一行没有缩进，就添加；如果有缩进，就移除
        const firstLine = selection.split('\n')[0].trim();
        const hasIndent = selection.split('\n')[0].startsWith(this.indentChar) || 
                         /^\s{2,}/.test(selection.split('\n')[0]);
        
        if (hasIndent) {
            this.removeSelectedIndent();
        } else {
            this.addSelectedIndent();
        }
    }
}

// 设置选项卡
class SmartIndentSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display() {
        const { containerEl } = this;
        
        containerEl.empty();
        
        // 插件标题
        containerEl.createEl('h2', { text: '智能首行缩进设置' });
        
        // 模式说明
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '💡 两种模式：1) 全文处理 2) 仅选中文字处理'
        });
        
        // 缩进字符设置
        new Setting(containerEl)
            .setName('缩进字符')
            .setDesc('选择首行缩进使用的字符')
            .addDropdown(dropdown => dropdown
                .addOption('2_full_width_spaces', '2个全角空格（推荐）')
                .addOption('4_spaces', '4个半角空格')
                .addOption('2_spaces', '2个半角空格')
                .addOption('tab', 'Tab字符')
                .setValue(this.plugin.indentChar === '　　' ? '2_full_width_spaces' : 
                         this.plugin.indentChar === '    ' ? '4_spaces' :
                         this.plugin.indentChar === '  ' ? '2_spaces' : 'tab')
                .onChange(async (value) => {
                    switch(value) {
                        case '2_full_width_spaces':
                            this.plugin.indentChar = '　　';
                            break;
                        case '4_spaces':
                            this.plugin.indentChar = '    ';
                            break;
                        case '2_spaces':
                            this.plugin.indentChar = '  ';
                            break;
                        case 'tab':
                            this.plugin.indentChar = '\t';
                            break;
                    }
                    await this.plugin.saveSettings();
                    new Notice(`✅ 缩进字符已设置为：${value}`);
                }));
        
        // 列表处理设置
        containerEl.createEl('h3', { text: '列表处理' });
        
        new Setting(containerEl)
            .setName('保护多层级列表缩进')
            .setDesc('保持列表的层级缩进结构不变，只对普通段落添加首行缩进')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldPreserveListIndent)
                .onChange(async (value) => {
                    this.plugin.shouldPreserveListIndent = value;
                    await this.plugin.saveSettings();
                    new Notice(value ? '✅ 多层级列表缩进保护已启用' : '⚠️ 多层级列表缩进保护已禁用');
                }));
        
        new Setting(containerEl)
            .setName('忽略所有列表')
            .setDesc('不对任何列表行应用首行缩进（包括顶级列表）')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldIgnoreLists)
                .onChange(async (value) => {
                    this.plugin.shouldIgnoreLists = value;
                    await this.plugin.saveSettings();
                }));
        
        // 其他排除规则
        containerEl.createEl('h3', { text: '其他排除规则' });
        
        new Setting(containerEl)
            .setName('忽略标题')
            .setDesc('不对 # 标题行应用缩进')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldIgnoreHeaders)
                .onChange(async (value) => {
                    this.plugin.shouldIgnoreHeaders = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('忽略表格')
            .setDesc('不对 | 表格行应用缩进')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldIgnoreTables)
                .onChange(async (value) => {
                    this.plugin.shouldIgnoreTables = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('忽略代码块')
            .setDesc('不对代码块和代码行应用缩进')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldIgnoreCode)
                .onChange(async (value) => {
                    this.plugin.shouldIgnoreCode = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('忽略引用')
            .setDesc('不对 > 引用块应用缩进')
            .addToggle(toggle => toggle
                .setValue(this.plugin.shouldIgnoreQuotes)
                .onChange(async (value) => {
                    this.plugin.shouldIgnoreQuotes = value;
                    await this.plugin.saveSettings();
                }));
        
        // 使用说明
        containerEl.createEl('h3', { text: '使用说明' });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '📝 全文处理命令：'
        });
        
        containerEl.createEl('ul', {
            cls: 'setting-item-description',
            innerHTML: `
                <li><code>切换全文首行缩进</code> - 对整个文档应用/移除首行缩进</li>
                <li><code>添加全文首行缩进</code> - 仅添加缩进</li>
                <li><code>移除全文首行缩进</code> - 仅移除缩进</li>
            `
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '🎯 选中文字处理命令（新增）：'
        });
        
        containerEl.createEl('ul', {
            cls: 'setting-item-description',
            innerHTML: `
                <li><code>切换选中文字首行缩进</code> - 智能判断并切换选中文字的缩进</li>
                <li><code>添加选中文字首行缩进</code> - 仅对选中文字添加缩进</li>
                <li><code>移除选中文字首行缩进</code> - 仅对选中文字移除缩进</li>
            `
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '💡 提示：选中文字处理会智能识别列表和格式，只对普通段落生效'
        });
        
        // 测试按钮
        containerEl.createEl('h3', { text: '测试功能' });
        
        new Setting(containerEl)
            .setName('测试多层级列表')
            .setDesc('插入测试内容，包含多层级列表和普通段落')
            .addButton(button => button
                .setButtonText('插入测试内容')
                .onClick(() => {
                    const testContent = `# 这是标题（不应缩进）

这是普通段落（应该缩进）。注意观察首行缩进效果。
这是第二行，没有缩进。

1. 顶级有序列表（不应缩进）
    1. 子列表项（应保持缩进，不应添加首行缩进）
        1. 孙列表项（应保持缩进，不应添加首行缩进）
    2. 另一个子列表项
2. 另一个顶级列表项

- 顶级无序列表（不应缩进）
    - 子列表项（应保持缩进）
        - 孙列表项（应保持缩进）
    - 另一个子列表项

> 顶级引用块（不应缩进）
>     > 嵌套引用（应保持缩进）
>     这是嵌套引用的内容

| 表格 | 测试 |（不应缩进）
|------|------|
| 单元格1 | 单元格2 |

代码块（不应缩进）：
\`\`\`javascript
console.log('hello');
    console.log('这行代码有缩进，应保持不变');
\`\`\`

这是另一个普通段落（应该缩进）。
注意：选中部分文字测试"选中文字首行缩进"功能。

1. 最后一个列表测试
   1. 子项1
      1. 子子项1
   2. 子项2`;

                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView && activeView.editor) {
                        activeView.editor.setValue(testContent);
                        new Notice('✅ 测试内容已插入，请使用命令测试功能');
                    } else {
                        new Notice('❌ 请先打开一个Markdown文件');
                    }
                }));
        
        // 重置按钮
        new Setting(containerEl)
            .setName('重置设置')
            .setDesc('恢复默认设置')
            .addButton(button => button
                .setButtonText('重置')
                .onClick(async () => {
                    this.plugin.shouldIgnoreHeaders = true;
                    this.plugin.shouldIgnoreLists = true;
                    this.plugin.shouldIgnoreTables = true;
                    this.plugin.shouldIgnoreCode = true;
                    this.plugin.shouldIgnoreQuotes = true;
                    this.plugin.shouldPreserveListIndent = true;
                    this.plugin.indentChar = '　　';
                    await this.plugin.saveSettings();
                    this.display(); // 刷新设置界面
                    new Notice('✅ 设置已重置为默认值');
                }));
    }
}

module.exports = SmartIndentPlugin;