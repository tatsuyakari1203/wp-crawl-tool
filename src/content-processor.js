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
    
    // Loại bỏ các thẻ script, style, noscript và comments
    $('script, style, noscript').remove();
    $('*').contents().filter(function() {
      return this.nodeType === 8; // Comment nodes
    }).remove();
    
    // Loại bỏ CSS code trong text nodes
    $('*').contents().filter(function() {
      return this.nodeType === 3; // Text nodes
    }).each(function() {
      const text = $(this).text();
      // Loại bỏ CSS code patterns
      if (text.includes('elementor') || 
          text.includes('background-color') || 
          text.includes('color:#') ||
          text.match(/\.[a-zA-Z-]+\s*\{[^}]*\}/g) ||
          text.match(/\/\*.*?\*\//g)) {
        $(this).remove();
      }
    });
    
    // Loại bỏ các thẻ và attributes không cần thiết
    this.cleanHtmlAttributes($);
    
    // Loại bỏ các thẻ div rỗng hoặc chỉ chứa whitespace
    $('div, span, section').each((i, elem) => {
      const $elem = $(elem);
      if ($elem.text().trim() === '' && $elem.find('img, video, audio, iframe').length === 0) {
        $elem.remove();
      }
    });
    
    // Xử lý images - lưu thông tin để có thể tải về sau
    const images = [];
    $('img').each((i, elem) => {
      const $img = $(elem);
      const src = $img.attr('src');
      let alt = $img.attr('alt') || '';
      let caption = $img.closest('figure').find('figcaption').text() || '';
      
      // Cải thiện alt text nếu trống
      if (!alt) {
        // Thử lấy từ title attribute
        alt = $img.attr('title') || '';
        
        // Thử lấy từ caption
        if (!alt && caption) {
          alt = caption.substring(0, 100); // Giới hạn độ dài
        }
        
        // Thử lấy từ context xung quanh
        if (!alt) {
          const $parent = $img.parent();
          const contextText = $parent.text().trim();
          if (contextText && contextText.length < 200) {
            alt = contextText.substring(0, 100);
          }
        }
        
        // Fallback với tên file
        if (!alt && src) {
          const filename = basename(src).replace(/\.[^/.]+$/, ""); // Loại bỏ extension
          alt = filename.replace(/[-_]/g, ' '); // Thay dấu gạch ngang/dưới bằng space
        }
      }
      
      // Cải thiện caption
      if (!caption) {
        // Thử tìm text gần ảnh
        const $nextP = $img.closest('figure, div, p').next('p');
        if ($nextP.length && $nextP.text().length < 300) {
          caption = $nextP.text().trim();
        }
      }
      
      if (src) {
        images.push({
          src,
          alt: alt.trim(),
          caption: caption.trim(),
          index: i,
          originalAlt: $img.attr('alt') || '', // Giữ lại alt gốc
          originalCaption: $img.closest('figure').find('figcaption').text() || ''
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
   * Làm sạch HTML attributes không cần thiết
   */
  cleanHtmlAttributes($) {
    // Danh sách attributes cần giữ lại
    const keepAttributes = {
      'img': ['src', 'alt', 'title', 'data-image-index'],
      'a': ['href', 'title'],
      'table': ['border', 'cellpadding', 'cellspacing'],
      'td': ['colspan', 'rowspan'],
      'th': ['colspan', 'rowspan'],
      'blockquote': ['cite'],
      'code': ['class'], // Để syntax highlighting
      'pre': ['class']   // Để syntax highlighting
    };

    // Loại bỏ tất cả style attributes
    $('*').removeAttr('style');
    
    // Loại bỏ các class không cần thiết (giữ lại một số class quan trọng)
    $('*').each((i, elem) => {
      const $elem = $(elem);
      const tagName = elem.tagName.toLowerCase();
      const classAttr = $elem.attr('class');
      
      if (classAttr) {
        // Giữ lại class cho code highlighting
        if (tagName !== 'code' && tagName !== 'pre') {
          $elem.removeAttr('class');
        }
      }
      
      // Loại bỏ các attributes không cần thiết
      const allowedAttrs = keepAttributes[tagName] || [];
      const attrs = Object.keys(elem.attribs || {});
      
      attrs.forEach(attr => {
        if (!allowedAttrs.includes(attr) && !attr.startsWith('data-image-')) {
          $elem.removeAttr(attr);
        }
      });
    });

    // Loại bỏ các thẻ Elementor và WordPress specific
    $('.elementor-element, .elementor-widget, .wp-block-*').each((i, elem) => {
      const $elem = $(elem);
      // Giữ nội dung nhưng loại bỏ wrapper
      $elem.replaceWith($elem.html());
    });
  }

  /**
   * Phân tích cấu trúc nội dung để tạo format phù hợp cho DOCX
   */
  analyzeContentStructure($) {
    const structure = [];
    
    // Đầu tiên, tìm tất cả hình ảnh có data-image-index trong toàn bộ document
    $('img[data-image-index]').each((i, elem) => {
      const $elem = $(elem);
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
    });
    
    // Sau đó xử lý các elements khác theo thứ tự trong document
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

        case 'table':
          const tableData = this.parseTableData($elem, $);
          if (tableData.rows.length > 0) {
            structure.push({
              type: 'table',
              ...tableData
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
      categories: new Map(),
      tags: new Map(),
      authors: new Map(),
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

      // Categories với count
      meta.categories.forEach(cat => {
        const count = summary.categories.get(cat.name) || 0;
        summary.categories.set(cat.name, count + 1);
      });

      // Tags với count
      meta.tags.forEach(tag => {
        const count = summary.tags.get(tag.name) || 0;
        summary.tags.set(tag.name, count + 1);
      });

      // Authors với count
      if (meta.author) {
        const count = summary.authors.get(meta.author.name) || 0;
        summary.authors.set(meta.author.name, count + 1);
      }

      // Word count
      const content = this.processPostContent(post);
      summary.totalWords += content.plainText.split(/\s+/).length;
    });

    // Chuyển Map thành Array với count và sắp xếp
    const categoriesArray = Array.from(summary.categories.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const tagsArray = Array.from(summary.tags.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const authorsArray = Array.from(summary.authors.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      ...summary,
      categories: categoriesArray,
      tags: tagsArray,
      authors: authorsArray,
      averageWords: summary.totalWords / posts.length || 0
    };
  }

  /**
   * Tải và tối ưu hình ảnh
   */
  async downloadImage(imageUrl, baseUrl, index = 0, optimizeImage = true, postTitle = '') {
    try {
      // Validate input
      if (!imageUrl || typeof imageUrl !== 'string') {
        console.warn(`Invalid image URL: ${imageUrl}`);
        return null;
      }

      // Skip data URLs and invalid URLs
      if (imageUrl.startsWith('data:') || imageUrl.includes('base64')) {
        console.warn(`Skipping data URL: ${imageUrl.substring(0, 50)}...`);
        return null;
      }

      // Xử lý URL tương đối
      let fullUrl;
      try {
        if (imageUrl.startsWith('http')) {
          fullUrl = imageUrl;
        } else if (imageUrl.startsWith('//')) {
          fullUrl = 'https:' + imageUrl;
        } else {
          const base = new URL(baseUrl);
          fullUrl = new URL(imageUrl, base.origin).href;
        }
        
        // Validate final URL
        new URL(fullUrl); // This will throw if invalid
      } catch (urlError) {
        console.warn(`Invalid URL construction: ${imageUrl} with base ${baseUrl}`);
        return null;
      }

      // Tạo tên file dựa trên post title
      const urlObj = new URL(fullUrl);
      const originalName = basename(urlObj.pathname);
      const ext = extname(originalName) || '.jpg';
      
      // Tạo slug từ post title
      let filePrefix = 'image';
      if (postTitle) {
        filePrefix = postTitle
          .toLowerCase()
          .replace(/[^\w\s-]/g, '') // Loại bỏ ký tự đặc biệt
          .replace(/\s+/g, '-') // Thay space bằng dấu gạch ngang
          .replace(/-+/g, '-') // Loại bỏ dấu gạch ngang liên tiếp
          .substring(0, 50); // Giới hạn độ dài
      }
      
      const fileName = `${filePrefix}_${index + 1}_${Date.now()}${ext}`;
      const filePath = join(this.imagesDir, fileName);

      // Tải hình ảnh
      const response = await axios({
        method: 'GET',
        url: fullUrl,
        responseType: 'stream',
        timeout: 15000, // Tăng timeout
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      // Check response status
      if (response.status !== 200) {
        console.warn(`Failed to download image: ${fullUrl} - Status: ${response.status}`);
        return null;
      }

      // Lưu file
      const writer = createWriteStream(filePath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          try {
            if (optimizeImage) {
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
                localPath: optimizedPath,
                fileName: `optimized_${fileName}`,
                url: fullUrl
              });
            } else {
              // Giữ nguyên ảnh gốc
              resolve({
                originalPath: filePath,
                optimizedPath: filePath,
                localPath: filePath,
                fileName: fileName,
                url: fullUrl
              });
            }
          } catch (error) {
            resolve({
              originalPath: filePath,
              optimizedPath: filePath,
              localPath: filePath,
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
  async downloadPostImages(images, baseUrl, optimizeImage = true, postTitle = '') {
    const downloadedImages = [];
    const maxConcurrent = 3; // Giới hạn số ảnh download đồng thời
    
    // Chia images thành chunks để xử lý song song
    for (let i = 0; i < images.length; i += maxConcurrent) {
      const chunk = images.slice(i, i + maxConcurrent);
      
      const promises = chunk.map(async (image, chunkIndex) => {
        const globalIndex = i + chunkIndex;
        
        // Retry mechanism
        for (let retry = 0; retry < 3; retry++) {
          try {
            const downloaded = await this.downloadImage(image.src, baseUrl, globalIndex, optimizeImage, postTitle);
            
            if (downloaded) {
              return {
                ...image,
                ...downloaded
              };
            }
          } catch (error) {
            console.warn(`Retry ${retry + 1}/3 for image ${image.src}: ${error.message}`);
            if (retry === 2) {
              console.error(`Failed to download image after 3 retries: ${image.src}`);
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
          }
        }
        
        return null;
      });
      
      const results = await Promise.allSettled(promises);
      
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          downloadedImages.push(result.value);
        }
      });
      
      // Delay between chunks to avoid overwhelming the server
      if (i + maxConcurrent < images.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return downloadedImages;
  }

  /**
   * Parse table data từ HTML table element
   */
  parseTableData($table, $) {
    const tableData = {
      headers: [],
      rows: [],
      caption: ''
    };

    // Lấy caption nếu có
    const $caption = $table.find('caption');
    if ($caption.length > 0) {
      tableData.caption = $caption.text().trim();
    }

    // Xử lý header từ thead hoặc first row
    const $thead = $table.find('thead');
    if ($thead.length > 0) {
      const $headerRow = $thead.find('tr').first();
      $headerRow.find('th, td').each((i, cell) => {
        tableData.headers.push($(cell).text().trim());
      });
    } else {
      // Nếu không có thead, kiểm tra row đầu tiên có th không
      const $firstRow = $table.find('tr').first();
      const hasHeaderCells = $firstRow.find('th').length > 0;
      
      if (hasHeaderCells) {
        $firstRow.find('th, td').each((i, cell) => {
          tableData.headers.push($(cell).text().trim());
        });
      }
    }

    // Xử lý data rows từ tbody hoặc tất cả tr
    const $tbody = $table.find('tbody');
    let $dataRows;
    
    if ($tbody.length > 0) {
      $dataRows = $tbody.find('tr');
    } else {
      $dataRows = $table.find('tr');
      // Nếu có header, bỏ qua row đầu tiên
      if (tableData.headers.length > 0) {
        $dataRows = $dataRows.slice(1);
      }
    }

    // Parse từng row
    $dataRows.each((i, row) => {
      const $row = $(row);
      const rowData = [];
      
      // Chỉ xử lý td, không xử lý th trong data rows
      $row.find('td').each((j, cell) => {
        const $cell = $(cell);
        const cellText = $cell.text().trim();
        
        // Kiểm tra colspan và rowspan
        const colspan = parseInt($cell.attr('colspan')) || 1;
        const rowspan = parseInt($cell.attr('rowspan')) || 1;
        
        rowData.push({
          text: cellText,
          colspan: colspan,
          rowspan: rowspan
        });
      });
      
      if (rowData.length > 0) {
        tableData.rows.push(rowData);
      }
    });

    return tableData;
  }
}