cd "C:\Users\MEO\aipywork\61\embed-quiz"

# 初始化 Git 仓库
git init
git branch -M main

# 配置用户信息（如果未配置）
git config user.email "TLSecrets@github.com" 2>$null
git config user.name "TLSecrets" 2>$null

# 添加远程仓库
git remote add origin https://github.com/TLSecrets/embed-quiz.git

# 添加所有文件
git add .

git status
