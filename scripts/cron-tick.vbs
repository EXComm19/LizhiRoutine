' Hidden launcher for the Lizhi cron tick.
'
' Task Scheduler runs this via wscript.exe. The WshShell.Run window-style
' arg 0 launches PowerShell with NO visible window, so the every-minute
' tick never flashes a console on screen. Third arg False = fire-and-forget
' (don't block the scheduler waiting for it).
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File ""D:\LizhiRoutine\scripts\cron-tick.ps1""", 0, False
