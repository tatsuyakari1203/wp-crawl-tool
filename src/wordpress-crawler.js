import chalk from 'chalk';
import ora from 'ora';

export class WordPressCrawler {
  constructor(siteUrl) {
    this.siteUrl = siteUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiUrl = `${this.siteUrl}/wp-json/wp/v2`;
  }

  /**
   * Lấy tất cả posts từ WordPress site
   */
  async getAllPosts() {
    const spinner = ora('Đang lấy danh sách posts...').start();
    
    try {
      const posts = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        try {
          // Thử với _embed trước
          let response = await fetch(`${this.apiUrl}/posts?page=${page}&per_page=50&_embed`);
          
          // Nếu lỗi với _embed, thử không có _embed
          if (!response.ok && response.status === 400) {
            console.log(chalk.yellow(`⚠️  Lỗi với _embed, thử không có _embed...`));
            response = await fetch(`${this.apiUrl}/posts?page=${page}&per_page=50`);
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
          }
          
          const pagePosts = await response.json();
          
          if (pagePosts.length === 0) {
            hasMore = false;
          } else {
            posts.push(...pagePosts);
            page++;
            spinner.text = `Đã lấy ${posts.length} posts...`;
          }
          
          // Thêm delay nhỏ để tránh rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (pageError) {
          console.error(chalk.red(`Lỗi tại trang ${page}:`), pageError.message);
          // Nếu lỗi ở trang đầu tiên, throw error
          if (page === 1) {
            throw pageError;
          }
          // Nếu lỗi ở trang sau, dừng lại và trả về những gì đã lấy được
          hasMore = false;
        }
      }
      
      spinner.succeed(`Đã lấy thành công ${posts.length} posts`);
      return posts;
      
    } catch (error) {
      spinner.fail('Lỗi khi lấy posts từ WordPress');
      throw new Error(`Không thể lấy posts: ${error.message}`);
    }
  }

  /**
   * Lấy tất cả pages từ WordPress site
   */
  async getAllPages() {
    const spinner = ora('Đang lấy danh sách pages...').start();
    
    try {
      const pages = [];
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        try {
          // Thử với _embed trước
          let response = await fetch(`${this.apiUrl}/pages?page=${page}&per_page=50&_embed`);
          
          // Nếu lỗi với _embed, thử không có _embed
          if (!response.ok && response.status === 400) {
            console.log(chalk.yellow(`⚠️  Lỗi với _embed, thử không có _embed...`));
            response = await fetch(`${this.apiUrl}/pages?page=${page}&per_page=50`);
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
          }
          
          const pagePages = await response.json();
          
          if (pagePages.length === 0) {
            hasMore = false;
          } else {
            pages.push(...pagePages);
            page++;
            spinner.text = `Đã lấy ${pages.length} pages...`;
          }
          
          // Thêm delay nhỏ để tránh rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (pageError) {
          console.error(chalk.red(`Lỗi tại trang ${page}:`), pageError.message);
          // Nếu lỗi ở trang đầu tiên, throw error
          if (page === 1) {
            throw pageError;
          }
          // Nếu lỗi ở trang sau, dừng lại và trả về những gì đã lấy được
          hasMore = false;
        }
      }
      
      spinner.succeed(`Đã lấy thành công ${pages.length} pages`);
      return pages;
      
    } catch (error) {
      spinner.fail('Lỗi khi lấy pages từ WordPress');
      throw new Error(`Không thể lấy pages: ${error.message}`);
    }
  }

  /**
   * Lấy thông tin chi tiết của một post
   */
  async getPostDetails(postId) {
    try {
      const response = await fetch(`${this.apiUrl}/posts/${postId}?_embed`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error(chalk.red(`Lỗi khi lấy chi tiết post ${postId}:`), error.message);
      return null;
    }
  }

  /**
   * Lấy thông tin categories
   */
  async getCategories() {
    try {
      const response = await fetch(`${this.apiUrl}/categories?per_page=100`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error(chalk.red('Lỗi khi lấy categories:'), error.message);
      return [];
    }
  }

  /**
   * Lấy thông tin tags
   */
  async getTags() {
    try {
      const response = await fetch(`${this.apiUrl}/tags?per_page=100`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error(chalk.red('Lỗi khi lấy tags:'), error.message);
      return [];
    }
  }

  /**
   * Kiểm tra xem site có hỗ trợ WordPress REST API không
   */
  async checkApiAvailability() {
    const spinner = ora('Kiểm tra WordPress REST API...').start();
    
    try {
      const response = await fetch(`${this.apiUrl}/posts?per_page=1`);
      
      if (response.ok) {
        spinner.succeed('WordPress REST API hoạt động bình thường');
        return true;
      } else {
        spinner.fail('WordPress REST API không khả dụng');
        return false;
      }
      
    } catch (error) {
      spinner.fail('Không thể kết nối đến WordPress REST API');
      console.error(chalk.red('Chi tiết lỗi:'), error.message);
      return false;
    }
  }

  /**
   * Lấy thông tin site
   */
  async getSiteInfo() {
    try {
      const response = await fetch(`${this.siteUrl}/wp-json`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      console.error(chalk.red('Lỗi khi lấy thông tin site:'), error.message);
      return null;
    }
  }
}