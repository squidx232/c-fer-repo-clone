using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

internal static class DataProtectionCheck
{
    internal static unsafe void Run(string directory)
    {
        AssemblyLoadContext.Default.Resolving += (_, name) => {
            var file = Path.Combine(directory, name.Name + ".dll");
            return File.Exists(file) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(file) : null;
        };
        var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory, "Microsoft.AspNetCore.DataProtection.dll"));
        var selector = assembly.GetType("Microsoft.AspNetCore.DataProtection.SP800_108.SP800_108_CTR_HMACSHA512Util", true)!;
        var create = selector.GetMethods(BindingFlags.Public | BindingFlags.Static)
            .Single(m => m.Name == "CreateProvider" && m.GetParameters().Length == 2);
        var passed = true;
        var checks = new List<object>();
        foreach (var length in new[] {1, 32, 64, 65, 128}) {
            var key = Encoding.UTF8.GetBytes("catalog-runtime-compatibility-test");
            var label = Encoding.UTF8.GetBytes("public-label");
            var context = Encoding.UTF8.GetBytes("public-context");
            var result = new byte[length];
            // Reference implementation: NIST counter-mode HMAC, independent of provider.
            var expected = new List<byte>();
            for (uint counter = 1; expected.Count < length; counter++) {
                var input = new List<byte>();
                input.AddRange(BitConverter.GetBytes(System.Net.IPAddress.HostToNetworkOrder((int)counter)));
                input.AddRange(label); input.Add(0); input.AddRange(context);
                input.AddRange(BitConverter.GetBytes(System.Net.IPAddress.HostToNetworkOrder(length * 8)));
                expected.AddRange(HMACSHA512.HashData(key, input.ToArray()));
            }
            fixed (byte* k = key, l = label, c = context, r = result) {
                using var provider = (IDisposable)create.Invoke(null, new object[] {Pointer.Box(k, typeof(byte*)), (uint)key.Length})!;
                var derive = provider.GetType().GetMethod("DeriveKey")!;
                derive.Invoke(provider, new object[] {Pointer.Box(l, typeof(byte*)), (uint)label.Length,
                    Pointer.Box(c, typeof(byte*)), (uint)context.Length, Pointer.Box(r, typeof(byte*)), (uint)length});
                var matches = CryptographicOperations.FixedTimeEquals(result, expected.Take(length).ToArray());
                passed &= matches;
                checks.Add(new {length, provider = provider.GetType().Name, matchesIndependentHmac = matches});
            }
        }
        // Exercise the same public constructor which previously failed in Cfer.Security.
        var ephemeral = Activator.CreateInstance(assembly.GetType("Microsoft.AspNetCore.DataProtection.EphemeralDataProtectionProvider", true)!)!;
        var protector = ephemeral.GetType().GetMethod("CreateProtector")!.Invoke(ephemeral, new object[] {"public-compatibility-check"})!;
        var api = protector.GetType().GetInterfaces().Single(t => t.Name == "IDataProtector");
        var plaintext = Encoding.UTF8.GetBytes("public roundtrip, not vendor data");
        var ciphertext = (byte[])api.GetMethod("Protect")!.Invoke(protector, new object[] {plaintext})!;
        var roundtrip = (byte[])api.GetMethod("Unprotect")!.Invoke(protector, new object[] {ciphertext})!;
        passed &= plaintext.SequenceEqual(roundtrip);
        ciphertext[^1] ^= 1;
        var tamperRejected = false;
        try { api.GetMethod("Unprotect")!.Invoke(protector, new object[] {ciphertext}); }
        catch (TargetInvocationException ex) when (ex.InnerException is CryptographicException) { tamperRejected = true; }
        passed &= tamperRejected;
        Console.WriteLine(JsonSerializer.Serialize(new {scope = "synthetic ASP.NET cryptography tests only", checks,
            roundtripMatches = plaintext.SequenceEqual(roundtrip), tamperRejected, passed}, new JsonSerializerOptions {WriteIndented = true}));
        Environment.ExitCode = passed ? 0 : 1;
    }
}
