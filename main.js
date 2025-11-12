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
        
        // 选中文字/当前段落处理命令
        this.addCommand({
            id: 'toggle-paragraph-indent',
            name: '切换当前段落/选中文字首行缩进',
            callback: () => this.toggleParagraphOrSelectedIndent(),
        });
        
        this.addCommand({
            id: 'add-paragraph-indent',
            name: '添加当前段落/选中文字首行缩进',
            callback: () => this.addParagraphOrSelectedIndent(),
        });
        
        this.addCommand({
            id: 'remove-paragraph-indent',
            name: '移除当前段落/选中文字首行缩进',
            callback: () => this.removeParagraphOrSelectedIndent(),
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
    
    // 获取当前编辑器信息
    getEditorInfo() {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView || !(activeView.editor)) {
            new Notice('❌ 请在Markdown编辑器中使用此功能');
            return null;
        }
        return {
            view: activeView,
            editor: activeView.editor,
            content: activeView.editor.getValue(),
            selection: activeView.editor.getSelection(),
            cursor: activeView.editor.getCursor()
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
        const editorInfo = this.getEditorInfo();
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
        const editorInfo = this.getEditorInfo();
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
    
    // ===== 获取当前段落范围 =====
    
    // 获取当前光标所在段落的范围
    getParagraphRange(editor, cursor) {
        const currentLine = cursor.line;
        const totalLines = editor.lineCount();
        
        // 向上查找段落开始
        let startLine = currentLine;
        while (startLine > 0) {
            const lineContent = editor.getLine(startLine - 1).trim();
            if (lineContent === '' || this.isExcludedLine(lineContent)) {
                break;
            }
            startLine--;
        }
        
        // 向下查找段落结束
        let endLine = currentLine;
        while (endLine < totalLines - 1) {
            const lineContent = editor.getLine(endLine + 1).trim();
            if (lineContent === '' || this.isExcludedLine(lineContent)) {
                break;
            }
            endLine++;
        }
        
        return {
            startLine,
            endLine,
            lineCount: endLine - startLine + 1
        };
    }
    
    // 判断是否是需要排除的行（列表、标题等）
    isExcludedLine(line) {
        // 检查是否是列表行
        const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                          /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                          /^\s*>/.test(line);
        
        // 检查是否是排除格式
        const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                          /^\s{4}/.test(line);
        
        return isListItem || isExcluded;
    }
    
    // 获取段落内容
    getParagraphContent(editor, range) {
        const lines = [];
        for (let i = range.startLine; i <= range.endLine; i++) {
            lines.push(editor.getLine(i));
        }
        return lines.join('\n');
    }
    
    // ===== 智能处理：选中文字或当前段落 =====
    
    // 智能判断：处理选中文字或当前段落
    processSelectionOrParagraph(editor, cursor, selection, processFunction, actionName) {
        try {
            let processedContent = '';
            let rangeInfo = null;
            let isSelection = false;
            
            // 情况1：有选中文本
            if (selection && selection.trim() !== '') {
                isSelection = true;
                rangeInfo = {
                    startLine: editor.listSelections()[0].anchor.line,
                    endLine: editor.listSelections()[0].head.line
                };
                processedContent = processFunction(selection);
                
                new Notice(`✅ ${actionName}已应用到选中文字（${rangeInfo.endLine - rangeInfo.startLine + 1}行）`);
            } 
            // 情况2：无选中文本，处理当前段落
            else {
                // 获取当前段落范围
                const paragraphRange = this.getParagraphRange(editor, cursor);
                rangeInfo = paragraphRange;
                
                // 获取段落内容
                const paragraphContent = this.getParagraphContent(editor, paragraphRange);
                
                // 检查是否是需要排除的段落（如列表段落）
                if (this.isParagraphExcluded(paragraphContent)) {
                    new Notice(`ℹ️ 当前段落是列表或特殊格式，${actionName}未应用`);
                    return false;
                }
                
                processedContent = processFunction(paragraphContent);
                
                new Notice(`✅ ${actionName}已应用到当前段落（${paragraphRange.lineCount}行）`);
            }
            
            // 替换内容
            if (isSelection) {
                // 替换选中内容
                editor.replaceSelection(processedContent);
            } else {
                // 替换整个段落
                const start = { line: rangeInfo.startLine, ch: 0 };
                const end = { line: rangeInfo.endLine, ch: editor.getLine(rangeInfo.endLine).length };
                editor.replaceRange(processedContent, start, end);
            }
            
            return true;
        } catch (error) {
            console.error(`${actionName}时出错:`, error);
            new Notice(`❌ ${actionName}时出错，请查看控制台`);
            return false;
        }
    }
    
    // 判断段落是否需要排除
    isParagraphExcluded(paragraphContent) {
        const lines = paragraphContent.split('\n');
        for (const line of lines) {
            if (this.isExcludedLine(line.trim())) {
                return true;
            }
        }
        return false;
    }
    
    // ===== 具体处理函数 =====
    
    // 添加缩进处理函数
    processAddIndent(text) {
        const lines = text.split('\n');
        const processedLines = [];
        
        for (const line of lines) {
            if (/^\s*$/.test(line)) {
                processedLines.push(line);
                continue;
            }
            
            const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                              /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                              /^\s*>/.test(line);
            
            const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                              /^\s{4}/.test(line);
            
            if (!isListItem && !isExcluded) {
                // processedLines.push(this.indentChar + line.trimStart());
                // processedLines.push("<font style='margin-left: 2em'>" + line.trimStart() + "</font>");
                processedLines.push("<p style='text-indent:2em' >" + line.trimStart() + "</p>");
            } else {
                processedLines.push(line);
            }
        }
        
        return processedLines.join('\n');
    }
    
    // 移除缩进处理函数
    processRemoveIndent(text) {
        const lines = text.split('\n');
        const processedLines = [];
        
        for (const line of lines) {
            if (/^\s*$/.test(line)) {
                processedLines.push(line);
                continue;
            }
            
            const isListItem = /^\s*(\d+\.|\-|\*|\+)\s/.test(line) || 
                              /^\s{2,}\s*(\d+\.|\-|\*|\+)\s/.test(line) ||
                              /^\s*>/.test(line);
            
            const isExcluded = /^(\s*#|```|<[^>]+>|\|[^|]*\||[\-\*]{3,})/.test(line) ||
                              /^\s{4}/.test(line);
            
            if (!isListItem && !isExcluded) {
                processedLines.push(line.replace(/^[‌‌‌‌　\s]+/, ''));
            } else {
                processedLines.push(line);
            }
        }
        
        return processedLines.join('\n');
    }
    
    // 判断是否有缩进
    hasIndent(text) {
        const firstLine = text.split('\n')[0];
        return firstLine.startsWith(this.indentChar) || /^\s{2,}/.test(firstLine);
    }
    
    // ===== 命令实现 =====
    
    // 添加当前段落/选中文字首行缩进
    addParagraphOrSelectedIndent() {
        const editorInfo = this.getEditorInfo();
        if (!editorInfo) return;
        
        this.processSelectionOrParagraph(
            editorInfo.editor,
            editorInfo.cursor,
            editorInfo.selection,
            (text) => this.processAddIndent(text),
            '添加首行缩进'
        );
    }
    
    // 移除当前段落/选中文字首行缩进
    removeParagraphOrSelectedIndent() {
        const editorInfo = this.getEditorInfo();
        if (!editorInfo) return;
        
        this.processSelectionOrParagraph(
            editorInfo.editor,
            editorInfo.cursor,
            editorInfo.selection,
            (text) => this.processRemoveIndent(text),
            '移除首行缩进'
        );
    }
    
    // 切换当前段落/选中文字首行缩进
    toggleParagraphOrSelectedIndent() {
        const editorInfo = this.getEditorInfo();
        if (!editorInfo) return;
        
        if (editorInfo.selection && editorInfo.selection.trim() !== '') {
            // 有选中文本
            const hasExistingIndent = this.hasIndent(editorInfo.selection);
            if (hasExistingIndent) {
                this.removeParagraphOrSelectedIndent();
            } else {
                this.addParagraphOrSelectedIndent();
            }
        } else {
            // 无选中文本，处理当前段落
            const paragraphRange = this.getParagraphRange(editorInfo.editor, editorInfo.cursor);
            const paragraphContent = this.getParagraphContent(editorInfo.editor, paragraphRange);
            
            if (this.isParagraphExcluded(paragraphContent)) {
                new Notice('ℹ️ 当前段落是列表或特殊格式，无法切换缩进');
                return;
            }
            
            const hasExistingIndent = this.hasIndent(paragraphContent);
            if (hasExistingIndent) {
                this.removeParagraphOrSelectedIndent();
            } else {
                this.addParagraphOrSelectedIndent();
            }
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
            text: '💡 三种模式：1) 全文处理 2) 选中文字处理 3) 当前段落处理（无选中时）'
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
            `
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '🎯 智能处理命令（推荐使用）：'
        });
        
        containerEl.createEl('ul', {
            cls: 'setting-item-description',
            innerHTML: `
                <li><code>切换当前段落/选中文字首行缩进</code> - 无选中时处理当前段落，有选中时处理选中文字</li>
                <li><code>添加当前段落/选中文字首行缩进</code> - 只添加缩进</li>
                <li><code>移除当前段落/选中文字首行缩进</code> - 只移除缩进</li>
            `
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '💡 智能特性：'
        });
        
        containerEl.createEl('ul', {
            cls: 'setting-item-description',
            innerHTML: `
                <li><strong>自动识别段落</strong>：无选中时，自动识别光标所在的完整段落</li>
                <li><strong>智能排除</strong>：自动跳过列表、表格、代码等特殊格式</li>
                <li><strong>段落保护</strong>：列表段落不会被误处理，保持原有缩进</li>
                <li><strong>精准控制</strong>：只影响需要缩进的普通段落</li>
            `
        });
        
        // 测试按钮
        containerEl.createEl('h3', { text: '测试功能' });
        
        new Setting(containerEl)
            .setName('测试段落处理')
            .setDesc('插入测试内容，体验无选中时的段落处理功能')
            .addButton(button => button
                .setButtonText('插入测试内容')
                .onClick(() => {
                    const testContent = `# 文档标题（不应缩进）

这是第一个普通段落。当光标在这个段落中且没有选中文字时，执行命令会处理整个段落。
注意：这是一个多行段落，包含：
- 项目符号
- 换行
- 各种内容

1. 有序列表（不应缩进）
   这是列表项的内容，包含多行文本。
   1. 子列表项（应保持原有缩进）
      这是子列表项的内容。

> 引用块（不应缩进）
> 这是引用的内容，包含多行。
>     > 嵌套引用（应保持缩进）

| 表格 | 测试 |（不应缩进）
|------|------|
| 单元格1 | 单元格2 |

这是第二个普通段落。可以测试选中部分文字或无选中时的处理效果。
第二行内容。
第三行内容。

- 无序列表（不应缩进）
  - 子列表项
    - 孙列表项
  
\`\`\`javascript
// 代码块（不应缩进）
function test() {
    console.log('hello');
    console.log('world');
}
\`\`\`

这是最后一个普通段落，用于测试段落识别功能。
当光标在段落中间时，应该能正确识别整个段落范围。

1. 另一个列表测试
   1. 子项1
      1. 孙项1
   2. 子项2`;

                    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (activeView && activeView.editor) {
                        activeView.editor.setValue(testContent);
                        new Notice('✅ 测试内容已插入，请将光标放在不同位置测试功能');
                    } else {
                        new Notice('❌ 请先打开一个Markdown文件');
                    }
                }));
        
        // 使用示例
        containerEl.createEl('h3', { text: '使用示例' });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '1. 将光标放在普通段落中，按 Ctrl+P，输入"切换当前段落"'
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '2. 选中一段文字，按 Ctrl+P，输入"切换当前段落"'
        });
        
        containerEl.createEl('div', {
            cls: 'setting-item-description',
            text: '3. 将光标放在列表段落中，执行命令（应该无变化）'
        });
        
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
