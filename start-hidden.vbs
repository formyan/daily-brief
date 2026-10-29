' Start the Daily Brief server without a console window.
' Logs go to data\server.log. Open http://127.0.0.1:4173 afterwards.
Option Explicit
Dim fso, shell, root, logDir, logFile, command
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
logDir = fso.BuildPath(root, "data")
If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)
logFile = fso.BuildPath(logDir, "server.log")
shell.CurrentDirectory = root
command = "cmd /c node server.mjs >> """ & logFile & """ 2>&1"
shell.Run command, 0, False
