# Clawdrop × Bento Guard — Terminal Demo
# Recorded with VHS (github.com/charmbracelet/vhs)

Output packages/trial-api/scripts/bento-demo.gif

Set Shell "zsh"
Set FontSize 14
Set FontFamily "JetBrains Mono"
Set Width 1200
Set Height 750
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms
Set PlaybackSpeed 1.25

# Open terminal and load env
Hide
Type "export $(grep -v '^#' .env.trial | xargs) 2>/dev/null"
Enter
Sleep 500ms
Show

# Clear screen and run demo
Type "clear"
Enter
Sleep 300ms

Type "tsx packages/trial-api/scripts/bento-demo.ts"
Enter

# Banner appears
Sleep 2s

# Section 1 - safe actions play out with spinners
Sleep 15s

# Section 2 - dangerous actions
Sleep 20s

# Section 3 - escalated
Sleep 10s

# Section 4 - live bug demos
Sleep 25s

# Footer visible
Sleep 4s
