import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import chalk from 'chalk';
import { UIHelper } from './utils/ui.js';

export class MarkdownExporter {
  constructor() {
    this.content = '';
    this.imagesDir = '';
  }

  /**
   * Tạo file markdown từ danh sách posts
   */
  async createMarkdown(posts, contentProcessor, options = {}) {
    console.log(UIHelper.createProgressBox('📝 Tạo Markdown Document', [
      `Chuẩn bị xử lý ${posts.length} bài viết`,
      'Đang khởi tạo markdown structure...'
    ]));

    try {
      const {
        includeTableOfContents = true,
        includeSummary = true,
        sortByDate = true,
        groupByCategory = false,
        downloadImages = true
      } = options;

      // Sắp xếp posts
      UIHelper.updateProgress(
        UIHelper.createProcessStatus('🔄', 'Sắp xếp posts', 'Theo thời gian...', '')
      );
      
      let sortedPosts = [...posts];
      if (sortByDate) {
        sortedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
      }

      // Tạo summary
      UIHelper.updateProgress(
        UIHelper.createProcessStatus('📊', 'Tạo summary', 'Phân tích nội dung...', '')
      );
      const summary = contentProcessor.createContentSummary(posts);
      
      // Khởi tạo markdown content
      this.content = '';

      // Title page
      UIHelper.updateProgress(
        UIHelper.createProcessStatus('📝', 'Tạo trang tiêu đề', 'Thiết kế layout...', '')
      );
      this.addTitlePage(summary);

      // Summary page
      if (includeSummary) {
        UIHelper.updateProgress(
          UIHelper.createProcessStatus('📋', 'Tạo trang tóm tắt', 'Thống kê dữ liệu...', '')
        );
        this.addSummaryPage(summary);
      }

      // Table of contents
      if (includeTableOfContents) {
        UIHelper.updateProgress(
          UIHelper.createProcessStatus('📑', 'Tạo mục lục', 'Liệt kê bài viết...', '')
        );
        this.addTableOfContents(sortedPosts);
      }

      // Posts content
      if (groupByCategory) {
        await this.addPostsByCategory(sortedPosts, contentProcessor, downloadImages, options.baseUrl);
      } else {
        await this.addPostsSequentially(sortedPosts, contentProcessor, downloadImages, options.baseUrl);
      }

      UIHelper.updateProgress(
        UIHelper.createProcessStatus('✅', 'Hoàn thành', 'Markdown đã được tạo', '')
      );

      console.log('');
      console.log(chalk.green('✅ Markdown content đã được tạo thành công!'));

    } catch (error) {
      console.log('');
      console.log(UIHelper.createErrorBox('Lỗi tạo markdown', [
        error.message,
        'Vui lòng kiểm tra lại dữ liệu đầu vào'
      ]));
      throw error;
    }
  }

  /**
   * Thêm trang tiêu đề
   */
  addTitlePage(summary) {
    this.content += `# WordPress Export\n\n`;
    this.content += `**Site:** ${summary.siteName || 'WordPress Site'}\n\n`;
    this.content += `**Ngày xuất:** ${new Date().toLocaleDateString('vi-VN')}\n\n`;
    this.content += `**Tổng số bài viết:** ${summary.totalPosts}\n\n`;
    this.content += `---\n\n`;
  }

  /**
   * Thêm trang tóm tắt
   */
  addSummaryPage(summary) {
    this.content += `## 📊 Tóm tắt nội dung\n\n`;
    
    // Thống kê cơ bản
    this.content += `### Thống kê tổng quan\n\n`;
    this.content += `- **Tổng số bài viết:** ${summary.totalPosts}\n`;
    this.content += `- **Tổng số từ:** ${summary.totalWords.toLocaleString()}\n`;
    this.content += `- **Trung bình từ/bài:** ${Math.round(summary.averageWords)}\n`;
    this.content += `- **Ngày đầu tiên:** ${summary.dateRange.earliest}\n`;
    this.content += `- **Ngày gần nhất:** ${summary.dateRange.latest}\n\n`;

    // Categories
    if (summary.categories.length > 0) {
      this.content += `### 📂 Categories (${summary.categories.length})\n\n`;
      summary.categories.forEach(cat => {
        this.content += `- **${cat.name}** (${cat.count} bài)\n`;
      });
      this.content += `\n`;
    }

    // Tags
    if (summary.tags.length > 0) {
      this.content += `### 🏷️ Tags phổ biến\n\n`;
      summary.tags.slice(0, 20).forEach(tag => {
        this.content += `- ${tag.name} (${tag.count})\n`;
      });
      this.content += `\n`;
    }

    // Authors
    if (summary.authors.length > 0) {
      this.content += `### ✍️ Tác giả\n\n`;
      summary.authors.forEach(author => {
        this.content += `- **${author.name}** (${author.count} bài)\n`;
      });
      this.content += `\n`;
    }

    this.content += `---\n\n`;
  }

  /**
   * Thêm mục lục
   */
  addTableOfContents(posts) {
    this.content += `## 📑 Mục lục\n\n`;
    
    posts.forEach((post, index) => {
      const title = this.cleanText(post.title.rendered);
      const date = new Date(post.date).toLocaleDateString('vi-VN');
      this.content += `${index + 1}. [${title}](#post-${post.id}) - *${date}*\n`;
    });
    
    this.content += `\n---\n\n`;
  }

  /**
   * Thêm posts theo thứ tự
   */
  async addPostsSequentially(posts, contentProcessor, downloadImages, baseUrl) {
    this.content += `## 📝 Nội dung bài viết\n\n`;
    
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      
      UIHelper.updateProgress(
        UIHelper.createProcessStatus(
          '📄', 
          `Xử lý bài viết ${i + 1}/${posts.length}`, 
          this.cleanText(post.title.rendered).substring(0, 50) + '...',
          UIHelper.createProgressBar(i + 1, posts.length, 25)
        )
      );

      await this.addPostContent(post, contentProcessor, i + 1, downloadImages, baseUrl);
    }
  }

  /**
   * Thêm posts theo category
   */
  async addPostsByCategory(posts, contentProcessor, downloadImages, baseUrl) {
    // Nhóm posts theo category
    const postsByCategory = {};
    
    for (const post of posts) {
      const categories = post._embedded?.['wp:term']?.[0] || [];
      const categoryName = categories.length > 0 ? categories[0].name : 'Uncategorized';
      
      if (!postsByCategory[categoryName]) {
        postsByCategory[categoryName] = [];
      }
      postsByCategory[categoryName].push(post);
    }

    this.content += `## 📝 Nội dung bài viết\n\n`;

    let postIndex = 1;
    for (const [categoryName, categoryPosts] of Object.entries(postsByCategory)) {
      this.content += `### 📂 ${categoryName}\n\n`;
      
      for (const post of categoryPosts) {
        UIHelper.updateProgress(
          UIHelper.createProcessStatus(
            '📄', 
            `Xử lý bài viết ${postIndex}/${posts.length}`, 
            this.cleanText(post.title.rendered).substring(0, 50) + '...',
            UIHelper.createProgressBar(postIndex, posts.length, 25)
          )
        );

        await this.addPostContent(post, contentProcessor, postIndex, downloadImages, baseUrl);
        postIndex++;
      }
    }
  }

  /**
   * Thêm nội dung một post
   */
  async addPostContent(post, contentProcessor, index, downloadImages, baseUrl) {
    const meta = contentProcessor.extractPostMeta(post);
    
    // Anchor cho mục lục
    this.content += `<a id="post-${post.id}"></a>\n\n`;
    
    // Tiêu đề
    this.content += `### ${index}. ${this.cleanText(meta.title)}\n\n`;
    
    // Meta info
    this.content += `**Ngày:** ${meta.date} | **Tác giả:** ${meta.author}\n\n`;
    
    if (meta.categories.length > 0) {
      this.content += `**Categories:** ${meta.categories.join(', ')}\n\n`;
    }
    
    if (meta.tags.length > 0) {
      this.content += `**Tags:** ${meta.tags.join(', ')}\n\n`;
    }

    // Nội dung
    const processedContent = await this.processContentForMarkdown(
      post.content.rendered, 
      contentProcessor, 
      downloadImages,
      post.id,
      baseUrl
    );
    
    this.content += processedContent;
    this.content += `\n\n---\n\n`;
  }

  /**
   * Xử lý nội dung HTML thành markdown
   */
  async processContentForMarkdown(htmlContent, contentProcessor, downloadImages, postId, baseUrl) {
    // Kiểm tra input
    if (!htmlContent) {
      return '';
    }

    // Sử dụng ContentProcessor để xử lý HTML
    const processed = contentProcessor.processPostContent({
      content: { rendered: htmlContent }
    });

    let markdownContent = processed.content || htmlContent;

    // Download images nếu cần
    if (downloadImages && processed.images.length > 0) {
      const downloadedImages = await contentProcessor.downloadPostImages(
          processed.images, 
          baseUrl,
          false // Không nén ảnh cho markdown
        );

      // Thay thế image references
      downloadedImages.forEach((img, index) => {
        if (img.localPath) {
          const relativePath = img.localPath.replace(contentProcessor.outputDir + '/', '');
          const altText = img.alt || `Image ${index + 1}`;
          const imageMarkdown = `![${altText}](${relativePath})`;
          
          // Thay thế img tag bằng markdown
          markdownContent = markdownContent.replace(
            new RegExp(`<img[^>]*data-image-index="${index}"[^>]*>`, 'g'),
            imageMarkdown
          );
        }
      });
    }

    // Chuyển đổi HTML còn lại thành markdown
    markdownContent = this.convertHtmlToMarkdown(markdownContent);
    
    return markdownContent;
  }

  /**
   * Chuyển đổi HTML thành markdown
   */
  convertHtmlToMarkdown(html) {
    if (!html || typeof html !== 'string') {
      return '';
    }
    
    let markdown = html;

    // Headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

    // Bold and italic
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // Links
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Code
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n\n');

    // Blockquotes
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
      return content.split('\n').map(line => '> ' + line.trim()).join('\n') + '\n\n';
    });

    // Lists
    markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gis, '$1\n');
    markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gis, '$1\n');
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    // Paragraphs
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Line breaks
    markdown = markdown.replace(/<br[^>]*>/gi, '\n');

    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]*>/g, '');

    // Clean up extra whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    return markdown;
  }

  /**
   * Làm sạch text
   */
  cleanText(text) {
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Lưu file markdown
   */
  async saveToFile(filename, outputDir = './output') {
    try {
      // Tạo thư mục output nếu chưa có
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Đảm bảo filename có extension .md
      const finalFilename = filename.endsWith('.md') ? filename : filename + '.md';
      const outputPath = join(outputDir, finalFilename);

      // Lưu file
      writeFileSync(outputPath, this.content, 'utf8');

      console.log('');
      console.log(UIHelper.createSuccessBox('File đã được lưu', [
        `📄 ${outputPath}`,
        `📊 ${this.content.length.toLocaleString()} ký tự`,
        `📝 ${this.content.split('\n').length.toLocaleString()} dòng`
      ]));

      return outputPath;

    } catch (error) {
      console.log('');
      console.log(UIHelper.createErrorBox('Lỗi lưu file', [
        error.message,
        'Vui lòng kiểm tra quyền ghi file'
      ]));
      throw error;
    }
  }
}