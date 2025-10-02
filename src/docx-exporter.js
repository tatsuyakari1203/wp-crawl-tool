import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType, ImageRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

export class DocxExporter {
  constructor() {
    this.document = null;
    this.sections = [];
  }

  /**
   * Tạo document DOCX từ danh sách posts
   */
  async createDocument(posts, contentProcessor, options = {}) {
    const spinner = ora('Đang tạo document DOCX...').start();
    
    try {
      const {
        includeTableOfContents = true,
        includeSummary = true,
        sortByDate = true,
        groupByCategory = false
      } = options;

      // Sắp xếp posts
      let sortedPosts = [...posts];
      if (sortByDate) {
        sortedPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
      }

      // Tạo summary
      const summary = contentProcessor.createContentSummary(posts);
      
      // Tạo các sections
      const sections = [];

      // Title page
      sections.push(...this.createTitlePage(summary));

      // Summary page
      if (includeSummary) {
        sections.push(...this.createSummaryPage(summary));
      }

      // Table of contents placeholder
      if (includeTableOfContents) {
        sections.push(...this.createTableOfContents(sortedPosts, contentProcessor));
      }

      // Posts content
      if (groupByCategory) {
        sections.push(...await this.createPostsByCategory(sortedPosts, contentProcessor, options.baseUrl));
      } else {
        sections.push(...await this.createPostsSequentially(sortedPosts, contentProcessor, options.baseUrl));
      }

      // Tạo document
      this.document = new Document({
        sections: [{
          properties: {},
          children: sections
        }]
      });

      spinner.succeed('Đã tạo xong document DOCX');
      return this.document;

    } catch (error) {
      spinner.fail('Lỗi khi tạo document DOCX');
      throw new Error(`Không thể tạo document: ${error.message}`);
    }
  }

  /**
   * Tạo trang tiêu đề
   */
  createTitlePage(summary) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "WordPress Posts Export",
            bold: true,
            size: 48
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Tổng số bài viết: ${summary.totalPosts}`,
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Từ ${summary.dateRange.earliest?.toLocaleDateString('vi-VN')} đến ${summary.dateRange.latest?.toLocaleDateString('vi-VN')}`,
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Tổng số từ: ${summary.totalWords.toLocaleString('vi-VN')}`,
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Xuất vào: ${new Date().toLocaleString('vi-VN')}`,
            size: 16,
            italics: true
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 }
      })
    ];
  }

  /**
   * Tạo trang tóm tắt
   */
  createSummaryPage(summary) {
    const sections = [
      new Paragraph({
        children: [
          new TextRun({
            text: "Tóm tắt nội dung",
            bold: true,
            size: 32
          })
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 }
      })
    ];

    // Categories
    if (summary.categories.length > 0) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Danh mục:",
              bold: true,
              size: 24
            })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: summary.categories.join(', '),
              size: 20
            })
          ],
          spacing: { after: 300 }
        })
      );
    }

    // Authors
    if (summary.authors.length > 0) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Tác giả:",
              bold: true,
              size: 24
            })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: summary.authors.join(', '),
              size: 20
            })
          ],
          spacing: { after: 300 }
        })
      );
    }

    // Tags (top 20)
    if (summary.tags.length > 0) {
      const topTags = summary.tags.slice(0, 20);
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Tags phổ biến:",
              bold: true,
              size: 24
            })
          ],
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: topTags.join(', '),
              size: 20
            })
          ],
          spacing: { after: 600 }
        })
      );
    }

    return sections;
  }

  /**
   * Tạo mục lục
   */
  createTableOfContents(posts, contentProcessor) {
    const sections = [
      new Paragraph({
        children: [
          new TextRun({
            text: "Mục lục",
            bold: true,
            size: 32
          })
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 400 }
      })
    ];

    posts.forEach((post, index) => {
      const meta = contentProcessor.extractPostMeta(post);
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${index + 1}. ${meta.title}`,
              size: 20
            }),
            new TextRun({
              text: ` (${meta.date.toLocaleDateString('vi-VN')})`,
              size: 16,
              italics: true
            })
          ],
          spacing: { after: 100 }
        })
      );
    });

    sections.push(
      new Paragraph({
        children: [],
        spacing: { after: 600 }
      })
    );

    return sections;
  }

  /**
   * Tạo nội dung posts theo thứ tự
   */
  async createPostsSequentially(posts, contentProcessor, baseUrl) {
    const sections = [];
    
    console.log(chalk.blue(`🔄 Đang xử lý ${posts.length} posts...`));

    for (let index = 0; index < posts.length; index++) {
      const post = posts[index];
      const progress = `${index + 1}/${posts.length}`;
      
      console.log(chalk.gray(`   📝 [${progress}] Xử lý: "${post.title.rendered.substring(0, 50)}${post.title.rendered.length > 50 ? '...' : ''}"`));
      
      const meta = contentProcessor.extractPostMeta(post);
      const content = contentProcessor.processPostContent(post);
      
      // Tải hình ảnh nếu có
      let downloadedImages = [];
      if (content.images && content.images.length > 0) {
        console.log(chalk.cyan(`   🖼️  [${progress}] Tải ${content.images.length} hình ảnh...`));
        downloadedImages = await contentProcessor.downloadPostImages(content.images, baseUrl);
        console.log(chalk.green(`   ✅ [${progress}] Đã tải xong ${downloadedImages.length} hình ảnh`));
      }
      
      sections.push(...this.createPostSection(meta, content, index + 1, true, downloadedImages));
      
      if ((index + 1) % 10 === 0) {
        console.log(chalk.green(`   ✨ Đã hoàn thành ${index + 1}/${posts.length} posts`));
      }
    }
    
    console.log(chalk.green(`✅ Hoàn thành xử lý tất cả ${posts.length} posts`));
    return sections;
  }

  /**
   * Tạo nội dung posts theo category
   */
  async createPostsByCategory(posts, contentProcessor, baseUrl) {
    const sections = [];
    const postsByCategory = {};

    console.log(chalk.blue(`🔄 Nhóm ${posts.length} posts theo category...`));

    // Nhóm posts theo category
    posts.forEach(post => {
      const meta = contentProcessor.extractPostMeta(post);
      const categories = meta.categories.length > 0 ? meta.categories : [{ name: 'Không phân loại' }];
      
      categories.forEach(category => {
        if (!postsByCategory[category.name]) {
          postsByCategory[category.name] = [];
        }
        postsByCategory[category.name].push(post);
      });
    });

    const categoryNames = Object.keys(postsByCategory);
    console.log(chalk.green(`✅ Đã nhóm thành ${categoryNames.length} categories`));

    // Tạo sections cho từng category
    let totalProcessed = 0;
    for (const [categoryName, categoryPosts] of Object.entries(postsByCategory)) {
      console.log(chalk.blue(`📂 Xử lý category: "${categoryName}" (${categoryPosts.length} posts)`));
      
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: categoryName,
              bold: true,
              size: 28
            })
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 400 }
        })
      );

      for (let index = 0; index < categoryPosts.length; index++) {
        const post = categoryPosts[index];
        totalProcessed++;
        const progress = `${totalProcessed}/${posts.length}`;
        
        console.log(chalk.gray(`   📝 [${progress}] "${post.title.rendered.substring(0, 40)}${post.title.rendered.length > 40 ? '...' : ''}"`));
        
        const meta = contentProcessor.extractPostMeta(post);
        const content = contentProcessor.processPostContent(post);
        
        // Tải hình ảnh nếu có
        let downloadedImages = [];
        if (content.images && content.images.length > 0) {
          console.log(chalk.cyan(`   🖼️  [${progress}] Tải ${content.images.length} hình ảnh...`));
          downloadedImages = await contentProcessor.downloadPostImages(content.images, baseUrl);
          console.log(chalk.green(`   ✅ [${progress}] Đã tải xong ${downloadedImages.length} hình ảnh`));
        }
        
        sections.push(...this.createPostSection(meta, content, index + 1, false, downloadedImages));
      }
      
      console.log(chalk.green(`✅ Hoàn thành category "${categoryName}"`));
    }

    console.log(chalk.green(`✅ Hoàn thành xử lý tất cả ${posts.length} posts theo categories`));
    return sections;
  }

  /**
   * Tạo section cho một post
   */
  createPostSection(meta, content, index, includeNumber = true, downloadedImages = []) {
    const sections = [];

    // Title
    const titleText = includeNumber ? `${index}. ${meta.title}` : meta.title;
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: titleText,
            bold: true,
            size: 24
          })
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 200 }
      })
    );

    // Meta info
    const metaInfo = [];
    metaInfo.push(`Ngày: ${meta.date.toLocaleDateString('vi-VN')}`);
    if (meta.author) metaInfo.push(`Tác giả: ${meta.author.name}`);
    if (meta.categories.length > 0) metaInfo.push(`Danh mục: ${meta.categories.map(c => c.name).join(', ')}`);

    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: metaInfo.join(' | '),
            size: 16,
            italics: true
          })
        ],
        spacing: { after: 300 }
      })
    );

    // Content structure
    content.structure.forEach(item => {
      sections.push(...this.createContentElement(item, downloadedImages));
    });

    // Separator
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "─".repeat(50),
            size: 12
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 400 }
      })
    );

    return sections;
  }

  /**
   * Tạo element cho từng loại content
   */
  createContentElement(item, downloadedImages = []) {
    const elements = [];

    switch (item.type) {
      case 'heading':
        const headingLevel = Math.min(item.level + 2, 6); // Offset by 2 since post title is H2
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                bold: true,
                size: Math.max(20 - (item.level * 2), 16)
              })
            ],
            heading: this.getHeadingLevel(headingLevel),
            spacing: { before: 200, after: 200 }
          })
        );
        break;

      case 'paragraph':
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                size: 20
              })
            ],
            spacing: { after: 200 }
          })
        );
        break;

      case 'list':
        item.items.forEach((listItem, index) => {
          const prefix = item.ordered ? `${index + 1}. ` : '• ';
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: prefix + listItem,
                  size: 20
                })
              ],
              spacing: { after: 100 }
            })
          );
        });
        break;

      case 'quote':
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `"${item.text}"`,
                size: 20,
                italics: true
              })
            ],
            spacing: { before: 200, after: 200 }
          })
        );
        break;

      case 'code':
        elements.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item.text,
                size: 18,
                font: 'Courier New'
              })
            ],
            spacing: { before: 200, after: 200 }
          })
        );
        break;

      case 'image':
        const imageData = downloadedImages.find(img => img.index === item.index);
        if (imageData && imageData.optimizedPath) {
          try {
            const imageBuffer = readFileSync(imageData.optimizedPath);
            elements.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: imageBuffer,
                    transformation: {
                      width: 400,
                      height: 300
                    }
                  })
                ],
                spacing: { before: 200, after: 200 },
                alignment: AlignmentType.CENTER
              })
            );

            // Thêm caption nếu có
            if (item.alt || item.caption) {
              elements.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: item.caption || item.alt,
                      size: 16,
                      italics: true
                    })
                  ],
                  spacing: { after: 200 },
                  alignment: AlignmentType.CENTER
                })
              );
            }
          } catch (error) {
            // Fallback nếu không thể load hình ảnh
            elements.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[Hình ảnh: ${item.alt || `Hình ${item.index + 1}`}${item.caption ? ` - ${item.caption}` : ''}]`,
                    size: 18,
                    italics: true
                  })
                ],
                spacing: { before: 200, after: 200 }
              })
            );
          }
        } else {
          // Fallback nếu không có hình ảnh
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `[Hình ảnh: ${item.alt || `Hình ${item.index + 1}`}${item.caption ? ` - ${item.caption}` : ''}]`,
                  size: 18,
                  italics: true
                })
              ],
              spacing: { before: 200, after: 200 }
            })
          );
        }
        break;

      case 'table':
        // Thêm caption nếu có
        if (item.caption) {
          elements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: item.caption,
                  size: 18,
                  bold: true
                })
              ],
              spacing: { before: 200, after: 100 },
              alignment: AlignmentType.CENTER
            })
          );
        }

        // Tạo table
        const tableRows = [];

        // Thêm header row nếu có
        if (item.headers && item.headers.length > 0) {
          const headerCells = item.headers.map(header => 
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: header,
                      size: 18,
                      bold: true
                    })
                  ]
                })
              ]
            })
          );
          tableRows.push(new TableRow({ children: headerCells }));
        }

        // Thêm data rows
        item.rows.forEach(row => {
          const dataCells = row.map(cell => 
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell.text || '',
                      size: 16
                    })
                  ]
                })
              ],
              columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
              rowSpan: cell.rowspan > 1 ? cell.rowspan : undefined
            })
          );
          tableRows.push(new TableRow({ children: dataCells }));
        });

        if (tableRows.length > 0) {
          elements.push(
            new Table({
              rows: tableRows,
              width: {
                size: 100,
                type: WidthType.PERCENTAGE
              }
            })
          );

          // Thêm spacing sau table
          elements.push(
            new Paragraph({
              children: [new TextRun({ text: '', size: 12 })],
              spacing: { after: 200 }
            })
          );
        }
        break;
    }

    return elements;
  }

  /**
   * Chuyển đổi level number thành HeadingLevel enum
   */
  getHeadingLevel(level) {
    const levels = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6
    };
    return levels[level] || HeadingLevel.HEADING_6;
  }

  /**
   * Lưu document ra file
   */
  async saveToFile(filename, outputDir = './output') {
    if (!this.document) {
      throw new Error('Chưa có document để lưu. Hãy gọi createDocument() trước.');
    }

    const spinner = ora('Đang lưu file DOCX...').start();

    try {
      // Tạo buffer từ document
      const buffer = await Packer.toBuffer(this.document);
      
      // Đảm bảo filename có extension .docx
      if (!filename.endsWith('.docx')) {
        filename += '.docx';
      }

      // Tạo đường dẫn đầy đủ
      const fullPath = join(outputDir, filename);
      
      // Lưu file
      writeFileSync(fullPath, buffer);
      
      spinner.succeed(`Đã lưu file: ${fullPath}`);
      return fullPath;

    } catch (error) {
      spinner.fail('Lỗi khi lưu file DOCX');
      throw new Error(`Không thể lưu file: ${error.message}`);
    }
  }
}