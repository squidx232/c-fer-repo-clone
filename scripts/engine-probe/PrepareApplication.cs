using System.IO;
using System.Reflection;
using System.Text.Json;

internal static class PrepareApplication
{
    internal static void Run(string source, string destination)
    {
        if (Path.GetFullPath(source) == Path.GetFullPath(destination)) throw new ArgumentException("Use a separate staging directory.");
        if (Directory.Exists(destination) && Directory.EnumerateFileSystemEntries(destination).Any())
            throw new ArgumentException("Staging destination must be empty to avoid stale or mixed dependencies.");
        Directory.CreateDirectory(destination);
        var records = new List<object>();
        var conflicts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in Directory.EnumerateFiles(source)) {
            var targetName = Path.GetFileName(file);
            try {
                var name = AssemblyName.GetAssemblyName(file);
                // Resource satellites require a culture subdirectory.
                targetName = string.IsNullOrEmpty(name.CultureName)
                    ? name.Name + ".dll" : Path.Combine(name.CultureName, name.Name + ".dll");
            } catch (BadImageFormatException) { }
              catch (FileLoadException) { }
            if (conflicts.Contains(targetName)) {
                File.Copy(file, Path.Combine(destination, "unresolved-variants", Path.GetFileName(file)), true);
                records.Add(new {source = Path.GetFileName(file), destination = "unresolved-variants/", conflict = targetName});
                continue;
            }
            var target = Path.Combine(destination, targetName);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            if (File.Exists(target)) {
                if (!System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(file)).SequenceEqual(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(target)))) {
                    // Do not guess between RID/architecture variants with identical identities.
                    conflicts.Add(targetName);
                    var variants = Path.Combine(destination, "unresolved-variants");
                    Directory.CreateDirectory(variants);
                    var existing = Path.Combine(variants, Path.GetFileName(target) + ".first");
                    File.Move(target, existing, true);
                    File.Copy(file, Path.Combine(variants, Path.GetFileName(file)), true);
                    records.Add(new {source = Path.GetFileName(file), destination = "unresolved-variants/", conflict = targetName});
                    continue;
                }
            } else File.Copy(file, target);
            records.Add(new {source = Path.GetFileName(file), destination = targetName});
        }
        // Runtime config/deps names must match the restored main assembly casing.
        foreach (var suffix in new[] {".deps.json", ".runtimeconfig.json"}) {
            var original = Path.Combine(source, "pcpump" + suffix);
            if (File.Exists(original)) File.Copy(original, Path.Combine(destination, "PcPump" + suffix), true);
        }
        File.WriteAllText(Path.Combine(destination, "staging-map.json"), JsonSerializer.Serialize(records, new JsonSerializerOptions {WriteIndented = true}));
        var dependencyFile = Path.Combine(source, "pcpump.deps.json");
        var missing = new List<string>();
        if (File.Exists(dependencyFile)) {
            using var dependencies = JsonDocument.Parse(File.ReadAllText(dependencyFile));
            foreach (var target in dependencies.RootElement.GetProperty("targets").EnumerateObject())
                foreach (var library in target.Value.EnumerateObject())
                    if (library.Value.TryGetProperty("runtime", out var assets))
                        foreach (var asset in assets.EnumerateObject()) {
                            var filename = Path.GetFileName(asset.Name);
                            if (!Directory.EnumerateFiles(destination).Any(p => string.Equals(Path.GetFileName(p), filename, StringComparison.OrdinalIgnoreCase))) missing.Add(asset.Name);
                        }
        }
        File.WriteAllText(Path.Combine(destination, "staging-readiness.json"), JsonSerializer.Serialize(new {
            scope = "assembly filename restoration only, NOT normal installation or startup readiness",
            files = records.Count, conflicts = conflicts.OrderBy(n => n).ToArray(),
            missingRuntimeAssets = missing.Distinct().OrderBy(n => n).ToArray(),
            runtimeTargetsResolved = false
        }, new JsonSerializerOptions {WriteIndented = true}));
        Console.WriteLine($"Staged {records.Count} files; {conflicts.Count} ambiguous identities quarantined; {missing.Distinct().Count()} runtime assets unresolved. Code unchanged.");
    }
}
