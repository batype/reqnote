# 首版验证记录

日期：2026-10-22。测试数据均为合成示例，没有提交生产凭据。

## 自动检查

- `npm test`：17组通过。覆盖Bash引号/续行、拒绝动态shell和文件、常用参数、空正文、重复查询与表单、显式请求头、Basic Auth、嵌套脱敏、自定义字段、长整数与小数原文、非结构化正文、受限Fetch头、GET正文、重复头提示与输入上限。
- 生成Fetch由stub实际执行，核对方法、请求头、正文和重定向参数；没有发送网络请求。生成cURL重新解析后保持请求模型。
- CLI验证默认脱敏、显式原始模式、JSON元数据、错误不回显输入、新文件0600权限、不覆盖既有文件/输入/符号链接/硬链接。
- `npm run build`：TypeScript检查及Vite生产构建通过，无构建警告。
- 对含Unicode、引号和长整数的合成请求，生成Fetch/Axios经`node --check`，Python经`ast.parse`语法检查。

## 安装包

`npm pack`后在项目外独立目录安装tarball（offline、ignore-scripts），导入`@batype/reqnote`验证默认脱敏，并运行安装后的`reqnote --version`得到1.0.0。CLI的唯一运行时依赖为jsonc-parser；不依赖React组件或浏览器。

## 浏览器实测

正式构建由Vite preview运行。桌面1280×960、手机390×844检查亮暗主题；页面没有横向溢出（手机clientWidth与scrollWidth均为375，滚动条占用15px）。主题切换正常。

- 五种代码目标均不含示例令牌/secret，并保留19位数字文本。
- 默认脱敏、自定义email字段、原始模式切换检查通过。
- 输入改动后禁止复制旧结果；未知选项显示错误，结果清空；清空后可重新载入示例。
- 点击复制后核对剪贴板内容；下载文本与复制文本相同，令牌已替换。
- 通过浏览器文件选择器导入合成cURL文件，输入正确读入，并禁用旧结果的复制/下载。
- 正式构建CSP包含`connect-src 'none'`，Worker正常工作，控制台无警告/错误。

截图：preview-light.png、preview-dark.png、preview-mobile.png。

## 边界

未对所有浏览器、所有curl选项或客户端网络行为做兼容性保证；没有向示例地址发送请求。脱敏是规则替换，仍需人工核对。npm注册表正式发布需要独立身份授权，不以tarball安装通过作为发布成功的证据。

## npm正式发布验证

2026-10-22（Asia/Shanghai），`npm publish`完成身份与发布验证后返回`+ @batype/reqnote@1.0.0`。等待npm处理后，公开注册表查询返回1.0.0，SHA-1为`27b20a62272a25ec9403c54c9fb23fded9d80b18`，与已验证tarball一致。

随后在项目外使用独立空缓存、`--userconfig=/dev/null`、官方registry和`--ignore-scripts`安装`@batype/reqnote@1.0.0`，五种API目标的默认脱敏与19位数字原文检查全部通过；安装后的CLI stdin转换及`--version`通过（1.0.0）。此验证使用注册表包，不是本地tarball替代安装。
