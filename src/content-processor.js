import * as cheerio from 'cheerio';
import { convert } from 'html-to-text';
import axios from 'axios';
import sharp from 'sharp';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { URL } from 'url';

export class ContentProcessor {
  constructor(outputDir = './output') {
    this.outputDir = outputDir;
    this.imagesDir = join(outputDir, 'images');
    
    // Tạo thư mục images nếu chưa tồn tại
    if (!existsSync(this.imagesDir)) {
      mkdirSync(this.imagesDir, { recursive: true });
    }
    
    this.htmlToTextOptions = {
      wordwrap: false,
      preserveNewlines: true,
      uppercaseHeadings: false,
      selectors: [
        { selector: 'h1', options: { uppercase: false } },
        { selector: 'h2', options: { uppercase: false } },
        { selector: 'h3', options: { uppercase: false } },
        { selector: 'h4', options: { uppercase: false } },
        { selector: 'h5', options: { uppercase: false } },
        { selector: 'h6', options: { uppercase: false } },
        { selector: 'p', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'ul', options: { itemPrefix: '• ' } },
        { selector: 'ol', options: { itemPrefix: function(o, item, index) { return `${index + 1}. `; } } },
        { selector: 'blockquote', options: { trimEmptyLines: true } },
        { selector: 'pre', options: { preserveNewlines: true } },
        { selector: 'code', format: 'inline' }
      ]
    };
  }

  /**
   * Xử lý nội dung HTML của post
   */
  processPostContent(post) {
    const $ = cheerio.load(post.content.rendered);
    
    // Loại bỏ các thẻ script và style
    $('script, style').remove();
    
    // Xử lý images - lưu thông tin để có thể tải về sau
    const images = [];
    $('img').each((i, elem) => {
      const $img = $(elem);
      const src = $img.attr('src');
      const alt = $img.attr('alt') || '';
      const caption = $img.closest('figure').find('figcaption').text() || '';
      
      if (src) {
        images.push({
          src,
          alt,
          caption,
          index: i
        });
        
        // Thêm data attribute để nhận diện sau này
        $img.attr('data-image-index', i);
      }
    });
    
    // Xử lý links
    $('a').each((i, elem) => {
      const $link = $(elem);
      const href = $link.attr('href');
      const text = $link.text();
      
      if (href && text) {
        $link.replaceWith(`${text} (${href})`);
      }
    });
    
    // Lấy HTML đã được xử lý
    const processedHtml = $.html();
    
    return {
      html: processedHtml,
      plainText: convert(processedHtml, this.htmlToTextOptions),
      images,
      structure: this.analyzeContentStructure($)
    };
  }

  /**
   * Phân tích cấu trúc nội dung để tạo format phù hợp cho DOCX
   */
  analyzeContentStructure($) {
    const structure = [];
    
    $('body').children().each((i, elem) => {
      const $elem = $(elem);
      const tagName = elem.tagName.toLowerCase();
      
      switch (tagName) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          structure.push({
            type: 'heading',
            level: parseInt(tagName.charAt(1)),
            text: $elem.text().trim()
          });
          break;
          
        case 'p':
          const paragraphText = $elem.text().trim();
          if (paragraphText) {
            structure.push({
              type: 'paragraph',
              text: paragraphText
            });
          }
          break;
          
        case 'ul':
        case 'ol':
          const listItems = [];
          $elem.find('li').each((j, li) => {
            listItems.push($(li).text().trim());
          });
          structure.push({
            type: 'list',
            ordered: tagName === 'ol',
            items: listItems
          });
          break;
          
        case 'blockquote':
          structure.push({
            type: 'quote',
            text: $elem.text().trim()
          });
          break;
          
        case 'pre':
        case 'code':
          structure.push({
            type: 'code',
            text: $elem.text()
          });
          break;

        case 'img':
          const imageIndex = parseInt($elem.attr('data-image-index'));
          if (!isNaN(imageIndex)) {
            structure.push({
              type: 'image',
              index: imageIndex,
              src: $elem.attr('src'),
              alt: $elem.attr('alt') || '',
              caption: $elem.closest('figure').find('figcaption').text() || ''
            });
          }
          break;
          
        default:
          const defaultText = $elem.text().trim();
          if (defaultText) {
            structure.push({
              type: 'paragraph',
              text: defaultText
            });
          }
      }
    });
    
    return structure;
  }

  /**
   * Xử lý excerpt của post
   */
  processExcerpt(post) {
    if (!post.excerpt || !post.excerpt.rendered) {
      return '';
    }
    
    const $ = cheerio.load(post.excerpt.rendered);
    $('script, style').remove();
    
    return convert($.html(), this.htmlToTextOptions).trim();
  }

  /**
   * Lấy thông tin meta của post
   */
  extractPostMeta(post) {
    const meta = {
      id: post.id,
      title: this.decodeHtmlEntities(post.title.rendered),
      slug: post.slug,
      status: post.status,
      type: post.type,
      link: post.link,
      date: new Date(post.date),
      modified: new Date(post.modified),
      author: null,
      categories: [],
      tags: [],
      featuredImage: null
    };

    // Xử lý author
    if (post._embedded && post._embedded.author && post._embedded.author[0]) {
      meta.author = {
        id: post._embedded.author[0].id,
        name: post._embedded.author[0].name,
        slug: post._embedded.author[0].slug
      };
    } else if (post.author) {
      // Fallback khi không có _embedded
      meta.author = {
        id: post.author,
        name: 'Unknown Author',
        slug: 'unknown'
      };
    }

    // Xử lý categories
    if (post._embedded && post._embedded['wp:term']) {
      const categories = post._embedded['wp:term'].find(terms => 
        terms.length > 0 && terms[0].taxonomy === 'category'
      );
      if (categories) {
        meta.categories = categories.map(cat => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug
        }));
      }

      // Xử lý tags
      const tags = post._embedded['wp:term'].find(terms => 
        terms.length > 0 && terms[0].taxonomy === 'post_tag'
      );
      if (tags) {
        meta.tags = tags.map(tag => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug
        }));
      }
    } else {
      // Fallback khi không có _embedded - sử dụng IDs
      if (post.categories && post.categories.length > 0) {
        meta.categories = post.categories.map(catId => ({
          id: catId,
          name: `Category ${catId}`,
          slug: `category-${catId}`
        }));
      }
      
      if (post.tags && post.tags.length > 0) {
        meta.tags = post.tags.map(tagId => ({
          id: tagId,
          name: `Tag ${tagId}`,
          slug: `tag-${tagId}`
        }));
      }
    }

    // Xử lý featured image
    if (post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]) {
      const media = post._embedded['wp:featuredmedia'][0];
      meta.featuredImage = {
        id: media.id,
        url: media.source_url,
        alt: media.alt_text || '',
        caption: media.caption ? media.caption.rendered : ''
      };
    } else if (post.featured_media && post.featured_media !== 0) {
      // Fallback khi không có _embedded
      meta.featuredImage = {
        id: post.featured_media,
        url: '',
        alt: 'Featured Image',
        caption: ''
      };
    }

    return meta;
  }

  /**
   * Decode HTML entities
   */
  decodeHtmlEntities(text) {
    const $ = cheerio.load(`<div>${text}</div>`);
    return $('div').text();
  }

  /**
   * Tạo summary cho toàn bộ nội dung
   */
  createContentSummary(posts) {
    const summary = {
      totalPosts: posts.length,
      dateRange: {
        earliest: null,
        latest: null
      },
      categories: new Set(),
      tags: new Set(),
      authors: new Set(),
      totalWords: 0
    };

    posts.forEach(post => {
      const meta = this.extractPostMeta(post);
      
      // Date range
      if (!summary.dateRange.earliest || meta.date < summary.dateRange.earliest) {
        summary.dateRange.earliest = meta.date;
      }
      if (!summary.dateRange.latest || meta.date > summary.dateRange.latest) {
        summary.dateRange.latest = meta.date;
      }

      // Categories, tags, authors
      meta.categories.forEach(cat => summary.categories.add(cat.name));
      meta.tags.forEach(tag => summary.tags.add(tag.name));
      if (meta.author) summary.authors.add(meta.author.name);

      // Word count
      const content = this.processPostContent(post);
      summary.totalWords += content.plainText.split(/\s+/).length;
    });

    return {
      ...summary,
      categories: Array.from(summary.categories),
      tags: Array.from(summary.tags),
      authors: Array.from(summary.authors)
    };
  }

  /**
   * Tải hình ảnh từ URL và lưu vào thư mục images
   */
  async downloadImage(imageUrl, baseUrl, index = 0) {
    try {
      // Xử lý URL tương đối
      let fullUrl;
      if (imageUrl.startsWith('http')) {
        fullUrl = imageUrl;
      } else if (imageUrl.startsWith('//')) {
        fullUrl = 'https:' + imageUrl;
      } else {
        const base = new URL(baseUrl);
        fullUrl = new URL(imageUrl, base.origin).href;
      }

      // Tạo tên file duy nhất
      const urlObj = new URL(fullUrl);
      const originalName = basename(urlObj.pathname);
      const ext = extname(originalName) || '.jpg';
      const fileName = `image_${index}_${Date.now()}${ext}`;
      const filePath = join(this.imagesDir, fileName);

      // Tải hình ảnh
      const response = await axios({
        method: 'GET',
        url: fullUrl,
        responseType: 'stream',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // Lưu file
      const writer = createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          try {
            // Tối ưu hình ảnh với sharp
            const optimizedPath = join(this.imagesDir, `optimized_${fileName}`);
            await sharp(filePath)
              .resize(800, 600, { 
                fit: 'inside',
                withoutEnlargement: true 
              })
              .jpeg({ quality: 80 })
              .toFile(optimizedPath);

            resolve({
              originalPath: filePath,
              optimizedPath: optimizedPath,
              fileName: `optimized_${fileName}`,
              url: fullUrl
            });
          } catch (error) {
            resolve({
              originalPath: filePath,
              optimizedPath: filePath,
              fileName: fileName,
              url: fullUrl
            });
          }
        });
        writer.on('error', reject);
      });

    } catch (error) {
      console.warn(`Không thể tải hình ảnh ${imageUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Tải tất cả hình ảnh từ một post
   */
  async downloadPostImages(images, baseUrl) {
    const downloadedImages = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const downloaded = await this.downloadImage(image.src, baseUrl, i);
      
      if (downloaded) {
        downloadedImages.push({
          ...image,
          ...downloaded
        });
      }
    }
    
    return downloadedImages;
  }
}