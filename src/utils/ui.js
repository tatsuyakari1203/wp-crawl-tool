import chalk from 'chalk';

export class UIHelper {
  /**
   * Tạo progress box với tiêu đề và danh sách thông tin
   */
  static createProgressBox(title, items = []) {
    const width = 60;
    const border = '═'.repeat(width);
    
    let content = `\n┌${border}┐\n`;
    content += `│ ${chalk.bold.cyan(title.padEnd(width - 2))} │\n`;
    content += `├${'─'.repeat(width)}┤\n`;
    
    items.forEach(item => {
      const paddedItem = item.padEnd(width - 2);
      content += `│ ${paddedItem} │\n`;
    });
    
    content += `└${border}┘\n`;
    return content;
  }

  /**
   * Tạo error box với tiêu đề và danh sách lỗi
   */
  static createErrorBox(title, errors = []) {
    const width = 60;
    const border = '═'.repeat(width);
    
    let content = `\n┌${border}┐\n`;
    content += `│ ${chalk.bold.red(title.padEnd(width - 2))} │\n`;
    content += `├${'─'.repeat(width)}┤\n`;
    
    errors.forEach(error => {
      const paddedError = error.padEnd(width - 2);
      content += `│ ${chalk.red(paddedError)} │\n`;
    });
    
    content += `└${border}┘\n`;
    return content;
  }

  /**
   * Tạo success box với tiêu đề và danh sách thông tin
   */
  static createSuccessBox(title, items = []) {
    const width = 60;
    const border = '═'.repeat(width);
    
    let content = `\n┌${border}┐\n`;
    content += `│ ${chalk.bold.green(title.padEnd(width - 2))} │\n`;
    content += `├${'─'.repeat(width)}┤\n`;
    
    items.forEach(item => {
      const paddedItem = item.padEnd(width - 2);
      content += `│ ${chalk.green(paddedItem)} │\n`;
    });
    
    content += `└${border}┘\n`;
    return content;
  }

  /**
   * Tạo process status cho progress updates
   */
  static createProcessStatus(icon, title, subtitle, progressBar) {
    return {
      icon,
      title,
      subtitle,
      progressBar
    };
  }

  /**
   * Cập nhật progress (in thực tế chỉ log ra console)
   */
  static updateProgress(status) {
    const { icon, title, subtitle, progressBar } = status;
    let output = `${icon} ${chalk.bold(title)}`;
    
    if (subtitle) {
      output += ` - ${chalk.gray(subtitle)}`;
    }
    
    if (progressBar) {
      output += `\n${progressBar}`;
    }
    
    console.log(output);
  }

  /**
   * Tạo progress bar
   */
  static createProgressBar(current, total, width = 30) {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `${bar} ${percentage}% (${current}/${total})`;
  }
}