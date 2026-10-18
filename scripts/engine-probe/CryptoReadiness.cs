using System.Runtime.InteropServices;
using System.Text.Json;

internal static class CryptoReadiness
{
    [DllImport("bcrypt.dll", CharSet = CharSet.Unicode)]
    private static extern int BCryptOpenAlgorithmProvider(out IntPtr handle, string algorithm, string? implementation, uint flags);
    [DllImport("bcrypt.dll")]
    private static extern int BCryptCloseAlgorithmProvider(IntPtr handle, uint flags);

    internal static void Run()
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Run under Windows or Wine.");
        var results = new List<object>();
        var failed = false;
        foreach (var algorithm in new[] {"SHA512", "AES", "SP800_108_CTR_HMAC"}) {
            var status = BCryptOpenAlgorithmProvider(out var handle, algorithm, null, 0);
            if (status == 0) BCryptCloseAlgorithmProvider(handle, 0);
            else failed = true;
            results.Add(new {algorithm, status = $"0x{unchecked((uint)status):X8}", opened = status == 0});
        }
        var module = NativeLibrary.Load("bcrypt.dll");
        bool exportsKeyDerivation;
        try { exportsKeyDerivation = NativeLibrary.TryGetExport(module, "BCryptKeyDerivation", out _); }
        finally { NativeLibrary.Free(module); }
        var kdfMatches = false;
        object managed;
        try {
            // Public, synthetic vector independently computed with Python hmac/SHA512.
            var derived = System.Security.Cryptography.SP800108HmacCounterKdf.DeriveBytes(
                System.Text.Encoding.UTF8.GetBytes("catalog-runtime-compatibility-test"),
                System.Security.Cryptography.HashAlgorithmName.SHA512,
                System.Text.Encoding.UTF8.GetBytes("public-label"),
                System.Text.Encoding.UTF8.GetBytes("public-context"), 32);
            var matches = Convert.ToHexString(derived).Equals(
                "b52e0704f1a56d3e221a6bdc9b440eabaffa41e8f5b5a3df307504f8ff5fe82a",
                StringComparison.OrdinalIgnoreCase);
            kdfMatches = matches;
            managed = new {status = matches ? "success" : "mismatch", matchesIndependentVector = matches};
        }
        catch (Exception error) {
            managed = new {status = "blocked", error = error.GetType().FullName, message = error.Message};
        }
        Console.WriteLine(JsonSerializer.Serialize(new {
            scope = "algorithm availability and synthetic KDF vector; no vendor keys, activation or catalog access",
            windowsVersion = Environment.OSVersion.VersionString,
            nativeResults = results,
            bcryptExportsKeyDerivation = exportsKeyDerivation,
            bundledAspNetSelectsNativeProvider = exportsKeyDerivation,
            note = "Bundled ASP.NET uses export detection; dotnetKdf success alone does not establish catalog readiness.",
            dotnetKdf = managed
        }, new JsonSerializerOptions {WriteIndented = true}));
        Environment.ExitCode = failed || !kdfMatches ? 1 : 0;
    }
}
