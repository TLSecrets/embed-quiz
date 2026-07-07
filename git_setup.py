import subprocess, os
base = r"C:\Users\MEO\aipywork\61\embed-quiz"
os.chdir(base)
def run(cmd):
    print(f">>> {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=base, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if r.stdout:
        print(r.stdout)
    if r.stderr:
        print(r.stderr)
    return r
# 1. Init
run("git init")
run("git branch -M main")
# 2. Config
run('git config user.email "TLSecrets@github.com"')
run('git config user.name "TLSecrets"')
# 3. Remote
run("git remote remove origin")
run("git remote add origin https://github.com/TLSecrets/embed-quiz.git")
# 4. Add all files
run("git add .")
# 5. Status
run("git status")
# 6. Commit
run('git commit -m "feat: 嵌入式应用开发刷题系统 - 167道题库全功能上线"')
print("\n✅ Git 仓库初始化完成，准备推送...")
print("请确认是否有 GitHub 仓库 https://github.com/TLSecrets/embed-quiz 存在，然后执行:")
print("  git push -u origin main")