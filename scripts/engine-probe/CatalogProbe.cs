using System.Collections;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;

internal static class CatalogProbe
{
    internal static void Run(string directory, string output)
    {
        if (directory == output || output.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Use a separate output directory, outside the application deployment.");
        Directory.CreateDirectory(output);
        File.Delete(Path.Combine(output, "catalog-only.json"));
        string Find(string name) => Directory.EnumerateFiles(directory)
            .Single(p => string.Equals(Path.GetFileName(p), name, StringComparison.OrdinalIgnoreCase));
        AssemblyLoadContext.Default.Resolving += (_, name) => {
            var file = Directory.EnumerateFiles(directory, "*.dll")
                .FirstOrDefault(p => string.Equals(Path.GetFileNameWithoutExtension(p), name.Name, StringComparison.OrdinalIgnoreCase));
            return file == null ? null : AssemblyLoadContext.Default.LoadFromAssemblyPath(file);
        };
        var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Find("PcPump.Data.dll"));
        var type = assembly.GetType("q6", true)!;
        var constructor = type.GetConstructor(new[] {typeof(string), typeof(string)})
            ?? throw new MissingMethodException("Expected original read-only manufacturer loader q6(string,string)");
        var reports = new List<object>();
        var blocked = false;
        foreach (var variant in new[] {"Database", "Database_Educational"}) {
            var source = Path.Combine(directory, variant, "equipment.db");
            var record = new Dictionary<string, object?> { ["variant"] = variant,
                ["loader"] = "q6(string,string): read-only manufacturer database" };
            if (!File.Exists(source)) {
                record["status"] = "missing";
                blocked = true;
                reports.Add(record);
                continue;
            }
            var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(source))).ToLowerInvariant();
            record["sourceSha256"] = digest;
            record["sourceBytes"] = new FileInfo(source).Length;
            var copy = Path.Combine(output, variant + ".probe.db");
            File.Copy(source, copy, true);
            var loaded = RuntimePaths.Attempt(() => {
                // Do not seed, replace or fabricate the application security singleton.
                using var database = (IDisposable)constructor.Invoke(new object?[] {copy, null});
                var counts = new Dictionary<string, int>();
                foreach (var (method, category) in new[] {
                    ("a9", "pumps"), ("bc", "rods"), ("bn", "driveHeads"),
                    ("a7", "casings"), ("be", "be:List<TubingTailJointDto>"),
                    ("bg", "bg:List<TubingTailJointDto>"), ("bh", "bh:List<ao8>"),
                    ("bl", "bl:List<aou>"), ("bq", "bq:List<ao4>"),
                    ("bs", "bs:List<ao6>"), ("bx", "bx:List<apx>"),
                    ("bz", "driveHousings"), ("b5", "b5:List<aob>"),
                    ("b6", "b6:List<apy>"), ("b8", "b8:List<aoz>"),
                    ("b9", "rodWhip"), ("ca", "brakes"),
                    ("cc", "gearboxes"), ("cd", "cd:List<PumpModel>")}) {
                    var entry = type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                        .Single(m => m.Name == method && m.GetParameters().All(p => p.IsOptional));
                    var parameters = entry.GetParameters().Select(p => p.DefaultValue).ToArray();
                    var items = entry.Invoke(database, parameters) as ICollection
                        ?? throw new InvalidOperationException("Original catalog method did not return a collection");
                    counts[category] = items.Count;
                }
                return new {opened = true, counts, scope = "original catalog collection counts; no simulation or unit normalization"};
            });
            record["attempt"] = loaded;
            if ((string?)loaded.GetType().GetProperty("status")!.GetValue(loaded) != "success") blocked = true;
            // Guard against accidental mutation of the original distributed catalog.
            record["sourceUnchanged"] = digest == Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(source))).ToLowerInvariant();
            if (!(bool)record["sourceUnchanged"]!) throw new IOException("Source catalog changed during probe");
            reports.Add(record);
        }
        var json = JsonSerializer.Serialize(new {
            scope = "manufacturer catalog only; correct read-only q6 loader; no security bypass",
            status = blocked ? "blocked" : "success", catalogs = reports
        }, new JsonSerializerOptions {WriteIndented = true});
        File.WriteAllText(Path.Combine(output, "catalog-only.json"), json);
        Console.WriteLine(json);
        Environment.ExitCode = blocked ? 1 : 0;
    }
}
