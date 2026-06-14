const path = require('path');
const fs = require('fs');

const dirs = [
  'uploads',
  'uploads/sanctions',
  'uploads/exports',
  'reports',
  'logs',
  'client',
  'client/public',
];

for (const dir of dirs) {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`创建目录: ${dir}`);
  }
}

const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (!fs.existsSync(gitignorePath)) {
  fs.writeFileSync(gitignorePath, `
node_modules/
.env.local
.env.production
*.log
logs/
uploads/sanctions/*
uploads/exports/*
!uploads/sanctions/.gitkeep
!uploads/exports/.gitkeep
reports/*
!reports/.gitkeep
.DS_Store
client/build/
client/node_modules/
.idea/
.vscode/
*.swp
coverage/
`);
  console.log('创建 .gitignore');
}

console.log('项目目录初始化完成');
