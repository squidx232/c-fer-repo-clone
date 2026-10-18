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
        Console.WriteLine(JsonSerializer.Serialize(new {
            scope = "native algorithm availability only; no keys, activation, catalog access or simulation",
            results
        }, new JsonSerializerOptions {WriteIndented = true}));
        Environment.ExitCode = failed ? 1 : 0;
    }
}
