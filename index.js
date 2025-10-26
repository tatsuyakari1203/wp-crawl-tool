#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { WordPressCrawler } from './src/wordpress-crawler.js';
import { ContentProcessor } from './src/content-processor.js';
import { DocxExporter } from './src/docx-exporter.js';
import { MarkdownExporter } from './src/markdown-exporter.js';

const program = new Command();

program
  .name('wp-crawl-tool')
  .description('Tool để crawl nội dung WordPress và xuất thành file DOCX')
  .version('1.0.0');

program
  .command('export')
  .description('Crawl và xuất tất cả posts từ WordPress site')
  .requiredOption('-u, --url <url>', 'URL của WordPress site (ví dụ: https://example.com)')
  .option('-o, --output <filename>', 'Tên file output', 'wordpress-export')
  .option('-d, --dir <directory>', 'Thư mục output', './output')
  .option('-f, --format <format>', 'Định dạng xuất (docx|markdown)', 'docx')
  .option('--no-toc', 'Không tạo mục lục')
  .option('--no-summary', 'Không tạo trang tóm tắt')
  .option('--group-by-category', 'Nhóm posts theo category')
  .option('--sort-by-title', 'Sắp xếp theo tiêu đề thay vì ngày')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('🚀 WordPress Crawl Tool'));
      console.log(chalk.gray('─'.repeat(50)));

      // Validate URL
      let siteUrl = options.url;
      if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
        siteUrl = 'https://' + siteUrl;
      }

      // Validate format
      if (!['docx', 'markdown'].includes(options.format.toLowerCase())) {
        console.error(chalk.red('❌ Format không hợp lệ. Chỉ hỗ trợ: docx, markdown'));
        process.exit(1);
      }

      const fileExtension = options.format.toLowerCase() === 'markdown' ? '.md' : '.docx';
      
      console.log(chalk.cyan(`📍 Site: ${siteUrl}`));
      console.log(chalk.cyan(`📁 Output: ${join(options.dir, options.output + fileExtension)}`));
      console.log(chalk.cyan(`📋 Format: ${options.format.toUpperCase()}`));
      console.log('');

      // Tạo thư mục output nếu chưa có
      if (!existsSync(options.dir)) {
        mkdirSync(options.dir, { recursive: true });
        console.log(chalk.green(`✅ Đã tạo thư mục: ${options.dir}`));
      }

      // Khởi tạo crawler
      const crawler = new WordPressCrawler(siteUrl);
      
      // Kiểm tra API availability
      const apiAvailable = await crawler.checkApiAvailability();
      if (!apiAvailable) {
        console.error(chalk.red('❌ WordPress REST API không khả dụng hoặc site không tồn tại'));
        process.exit(1);
      }

      // Lấy thông tin site
      const siteInfo = await crawler.getSiteInfo();
      if (siteInfo) {
        console.log(chalk.green(`✅ Kết nối thành công đến: ${siteInfo.name || 'WordPress Site'}`));
        console.log('');
      }

      // Crawl posts
      const posts = await crawler.getAllPosts();
      
      if (posts.length === 0) {
        console.log(chalk.yellow('⚠️  Không tìm thấy posts nào'));
        process.exit(0);
      }

      console.log(chalk.green(`✅ Đã crawl ${posts.length} posts`));

      // Xử lý content
      const processor = new ContentProcessor(options.dir);
      console.log(chalk.blue('🔄 Đang xử lý nội dung...'));

      const exportOptions = {
        includeTableOfContents: options.toc,
        includeSummary: options.summary,
        sortByDate: !options.sortByTitle,
        groupByCategory: options.groupByCategory,
        downloadImages: true,
        baseUrl: siteUrl
      };

      let outputPath;
      
      if (options.format.toLowerCase() === 'markdown') {
        // Tạo Markdown
        const exporter = new MarkdownExporter();
        await exporter.createMarkdown(posts, processor, exportOptions);
        outputPath = await exporter.saveToFile(options.output, options.dir);
      } else {
        // Tạo DOCX
        const exporter = new DocxExporter();
        await exporter.createDocument(posts, processor, exportOptions);
        outputPath = await exporter.saveToFile(options.output, options.dir);
      }
      
      console.log('');
      console.log(chalk.green.bold('🎉 Hoàn thành!'));
      console.log(chalk.cyan(`📄 File đã được lưu: ${outputPath}`));
      
      // Thống kê
      const summary = processor.createContentSummary(posts);
      console.log('');
      console.log(chalk.blue.bold('📊 Thống kê:'));
      console.log(chalk.gray(`   • Tổng posts: ${summary.totalPosts}`));
      console.log(chalk.gray(`   • Tổng từ: ${summary.totalWords.toLocaleString('vi-VN')}`));
      console.log(chalk.gray(`   • Categories: ${summary.categories.length}`));
      console.log(chalk.gray(`   • Tags: ${summary.tags.length}`));
      console.log(chalk.gray(`   • Tác giả: ${summary.authors.length}`));

    } catch (error) {
      console.error(chalk.red.bold('❌ Lỗi:'), error.message);
      process.exit(1);
    }
  });

program
  .command('check')
  .description('Kiểm tra WordPress site và API availability')
  .requiredOption('-u, --url <url>', 'URL của WordPress site')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('🔍 Kiểm tra WordPress Site'));
      console.log(chalk.gray('─'.repeat(50)));

      let siteUrl = options.url;
      if (!siteUrl.startsWith('http://') && !siteUrl.startsWith('https://')) {
        siteUrl = 'https://' + siteUrl;
      }

      const crawler = new WordPressCrawler(siteUrl);
      
      // Kiểm tra API
      const apiAvailable = await crawler.checkApiAvailability();
      
      if (apiAvailable) {
        // Lấy thông tin site
        const siteInfo = await crawler.getSiteInfo();
        
        // Lấy sample posts
        const spinner = ora('Đang lấy thông tin posts...').start();
        const sampleResponse = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=1`);
        const totalPosts = sampleResponse.headers.get('X-WP-Total') || 'Không xác định';
        spinner.succeed(`Tổng số posts: ${totalPosts}`);

        // Lấy categories và tags
        const categories = await crawler.getCategories();
        const tags = await crawler.getTags();

        console.log('');
        console.log(chalk.green.bold('✅ Thông tin site:'));
        if (siteInfo) {
          console.log(chalk.cyan(`   • Tên: ${siteInfo.name || 'Không xác định'}`));
          console.log(chalk.cyan(`   • Mô tả: ${siteInfo.description || 'Không có'}`));
          console.log(chalk.cyan(`   • URL: ${siteInfo.url || siteUrl}`));
        }
        console.log(chalk.cyan(`   • Tổng posts: ${totalPosts}`));
        console.log(chalk.cyan(`   • Categories: ${categories.length}`));
        console.log(chalk.cyan(`   • Tags: ${tags.length}`));
        
        console.log('');
        console.log(chalk.green('🎉 Site sẵn sàng để crawl!'));
        console.log(chalk.gray(`Chạy: bun run index.js export -u ${siteUrl}`));
        
      } else {
        console.log(chalk.red('❌ Site không hỗ trợ WordPress REST API hoặc không tồn tại'));
      }

    } catch (error) {
      console.error(chalk.red.bold('❌ Lỗi:'), error.message);
      process.exit(1);
    }
  });

// Xử lý khi không có command
program.on('command:*', () => {
  console.error(chalk.red('❌ Command không hợp lệ: %s'), program.args.join(' '));
  console.log(chalk.yellow('Sử dụng --help để xem danh sách commands'));
  process.exit(1);
});

// Parse arguments
program.parse();

// Hiển thị help nếu không có arguments
if (!process.argv.slice(2).length) {
  program.outputHelp();
}