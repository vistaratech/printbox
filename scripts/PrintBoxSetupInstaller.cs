using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

public class PrintBoxSetupInstaller : Form
{
    private Label lblTitle;
    private Label lblStatus;
    private ProgressBar progressBar;
    private Button btnAction;
    private CheckBox chkLaunch;
    private string installDir;
    private bool installFinished = false;

    [STAThread]
    public static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new PrintBoxSetupInstaller());
    }

    public PrintBoxSetupInstaller()
    {
        this.Text = "PrintBox Pro – Setup";
        this.Size = new Size(520, 360);
        this.StartPosition = FormStartPosition.CenterScreen;
        this.FormBorderStyle = FormBorderStyle.FixedDialog;
        this.MaximizeBox = false;
        this.MinimizeBox = true;
        this.BackColor = Color.FromArgb(12, 16, 32);
        this.ForeColor = Color.White;

        string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        installDir = Path.Combine(localApp, "PrintBox Pro");

        InitializeComponents();
    }

    private void InitializeComponents()
    {
        Panel header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 85,
            BackColor = Color.FromArgb(8, 11, 22)
        };

        lblTitle = new Label
        {
            Text = "🖨️ PrintBox Pro",
            Font = new Font("Segoe UI", 18, FontStyle.Bold),
            ForeColor = Color.FromArgb(0, 242, 254),
            Location = new Point(24, 16),
            AutoSize = true
        };

        Label lblSub = new Label
        {
            Text = "Smart Xerox Self-Service Terminal – Setup Wizard",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Color.FromArgb(148, 163, 184),
            Location = new Point(28, 50),
            AutoSize = true
        };

        header.Controls.Add(lblTitle);
        header.Controls.Add(lblSub);
        this.Controls.Add(header);

        lblStatus = new Label
        {
            Text = "Ready to install PrintBox Pro to your computer.\nTarget: " + installDir,
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(226, 232, 240),
            Location = new Point(28, 110),
            Size = new Size(450, 48)
        };
        this.Controls.Add(lblStatus);

        progressBar = new ProgressBar
        {
            Location = new Point(28, 175),
            Size = new Size(450, 22),
            Style = ProgressBarStyle.Blocks,
            Value = 0
        };
        this.Controls.Add(progressBar);

        chkLaunch = new CheckBox
        {
            Text = "Launch PrintBox Pro immediately after install",
            Checked = true,
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(203, 213, 225),
            Location = new Point(28, 215),
            AutoSize = true
        };
        this.Controls.Add(chkLaunch);

        btnAction = new Button
        {
            Text = "Install Now",
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(4, 8, 18),
            BackColor = Color.FromArgb(0, 242, 254),
            FlatStyle = FlatStyle.Flat,
            Location = new Point(340, 260),
            Size = new Size(138, 42),
            Cursor = Cursors.Hand
        };
        btnAction.FlatAppearance.BorderSize = 0;
        btnAction.Click += BtnAction_Click;
        this.Controls.Add(btnAction);
    }

    private void BtnAction_Click(object sender, EventArgs e)
    {
        if (installFinished)
        {
            if (chkLaunch.Checked)
            {
                string exePath = Path.Combine(installDir, "PrintBox.exe");
                if (File.Exists(exePath))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = exePath,
                        WorkingDirectory = installDir
                    });
                }
            }
            this.Close();
            return;
        }

        btnAction.Enabled = false;
        btnAction.Text = "Installing...";
        progressBar.Style = ProgressBarStyle.Marquee;
        lblStatus.Text = "Extracting PrintBox Pro core files...";

        Thread worker = new Thread(DoInstall);
        worker.IsBackground = true;
        worker.Start();
    }

    private void DoInstall()
    {
        try
        {
            if (!Directory.Exists(installDir))
            {
                Directory.CreateDirectory(installDir);
            }

            // Extract embedded zip payload via temp file
            Assembly asm = Assembly.GetExecutingAssembly();
            string tempZip = Path.Combine(Path.GetTempPath(), "PrintBoxPayload_" + Guid.NewGuid().ToString("N") + ".zip");
            
            using (Stream s = asm.GetManifestResourceStream("SetupPayload.zip"))
            {
                if (s != null)
                {
                    using (FileStream fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write))
                    {
                        byte[] buffer = new byte[65536];
                        int read;
                        while ((read = s.Read(buffer, 0, buffer.Length)) > 0)
                        {
                            fs.Write(buffer, 0, read);
                        }
                    }

                    // Extract using .NET standard ZipFile
                    System.IO.Compression.ZipFile.ExtractToDirectory(tempZip, installDir);
                    try { File.Delete(tempZip); } catch (Exception) {}
                }
            }

            // Create Desktop Shortcut
            CreateShortcut(
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "PrintBox Pro.lnk"),
                Path.Combine(installDir, "PrintBox.exe"),
                installDir,
                "PrintBox Pro – Xerox Smart Terminal"
            );

            // Create Start Menu Shortcut
            string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs", "PrintBox Pro");
            if (!Directory.Exists(startMenuDir)) Directory.CreateDirectory(startMenuDir);
            CreateShortcut(
                Path.Combine(startMenuDir, "PrintBox Pro.lnk"),
                Path.Combine(installDir, "PrintBox.exe"),
                installDir,
                "PrintBox Pro – Xerox Smart Terminal"
            );

            this.Invoke((MethodInvoker)delegate
            {
                progressBar.Style = ProgressBarStyle.Blocks;
                progressBar.Value = 100;
                lblStatus.Text = "Installation Complete! Shortcuts created on Desktop and Start Menu.";
                lblStatus.ForeColor = Color.FromArgb(16, 185, 129);
                btnAction.Enabled = true;
                btnAction.Text = "Finish";
                btnAction.BackColor = Color.FromArgb(16, 185, 129);
                btnAction.ForeColor = Color.Black;
                installFinished = true;
            });
        }
        catch (Exception ex)
        {
            this.Invoke((MethodInvoker)delegate
            {
                progressBar.Style = ProgressBarStyle.Blocks;
                lblStatus.Text = "Installation Failed: " + ex.Message;
                lblStatus.ForeColor = Color.FromArgb(244, 63, 94);
                btnAction.Enabled = true;
                btnAction.Text = "Retry";
            });
        }
    }

    private void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string description)
    {
        try
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.Description = description;
                shortcut.Save();
            }
        }
        catch (Exception) {}
    }
}
