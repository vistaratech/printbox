// PrintBox Pro – Native Windows Launcher
// Compiled with: csc /target:winexe /out:PrintBox.exe PrintBoxLauncher.cs
// This small .exe launches node.exe agent.js in the same directory

using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class PrintBoxLauncher
{
    [STAThread]
    static void Main(string[] args)
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodeExe = Path.Combine(appDir, "node.exe");
        string agentJs = Path.Combine(appDir, "agent.js");

        if (!File.Exists(nodeExe))
        {
            MessageBox.Show(
                "node.exe not found!\n\nExpected at: " + nodeExe +
                "\n\nPlease reinstall PrintBox Pro.",
                "PrintBox Pro – Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        if (!File.Exists(agentJs))
        {
            MessageBox.Show(
                "agent.js not found!\n\nExpected at: " + agentJs +
                "\n\nPlease reinstall PrintBox Pro.",
                "PrintBox Pro – Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        try
        {
            ProcessStartInfo psi = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "\"" + agentJs + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Failed to start PrintBox Pro:\n\n" + ex.Message,
                "PrintBox Pro – Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
