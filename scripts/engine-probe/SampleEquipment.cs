using System.Collections;
using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

internal static class SampleEquipment
{
    // Read public properties only: no arbitrary obfuscated method execution or
    // fields that could expose hidden runtime/security state. Raw units stay raw.
    private static object? Snapshot(object? value, int depth = 0)
    {
        if (value == null) return null;
        var type = value.GetType();
        if (type.IsEnum) return new {type = type.FullName, name = value.ToString(), raw = Convert.ToInt64(value)};
        if (value is string || type.IsPrimitive || value is decimal || value is Guid || value is DateTime) return value;
        if (depth >= 4) return new {type = type.FullName, truncated = true};
        if (value is IEnumerable items) {
            var list = new List<object?>();
            foreach (var item in items) {
                if (list.Count >= 1000) throw new InvalidDataException("Unexpected oversized sample collection");
                list.Add(Snapshot(item, depth + 1));
            }
            return list;
        }
        var result = new Dictionary<string, object?> { ["$type"] = type.FullName };
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance).OrderBy(p => p.Name)) {
            if (!property.CanRead || property.GetIndexParameters().Length != 0) continue;
            try { result[property.Name] = Snapshot(property.GetValue(value), depth + 1); }
            catch (Exception error) { result[property.Name] = new {unavailable = error.GetBaseException().GetType().Name}; }
        }
        return result;
    }

    internal static void Run(string directory, string output)
    {
        if (directory == output || output.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Use a separate output directory outside the application deployment");
        Directory.CreateDirectory(output);
        var reportPath = Path.Combine(output, "sample-equipment.json");
        File.Delete(reportPath);
        AssemblyLoadContext.Default.Resolving += (_, name) => {
            var file = Directory.EnumerateFiles(directory, "*.dll").SingleOrDefault(p =>
                string.Equals(Path.GetFileNameWithoutExtension(p), name.Name, StringComparison.OrdinalIgnoreCase));
            return file == null ? null : AssemblyLoadContext.Default.LoadFromAssemblyPath(file);
        };
        Assembly Load(string name) => AssemblyLoadContext.Default.LoadFromAssemblyPath(Directory.EnumerateFiles(directory, "*.dll")
            .Single(p => string.Equals(Path.GetFileNameWithoutExtension(p), name, StringComparison.OrdinalIgnoreCase)));
        var binary = Load("PcPump.Binary");
        var engine = Load("PcPump.Engine");
        var domains = Load("PcPump.Domains");
        var units = Load("Cfer.Units");
        var reader = binary.GetType("la", true)!;
        var parse = reader.GetMethods().Single(m => m.Name == "a" && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType == typeof(string));
        var profiles = Activator.CreateInstance(parse.GetParameters()[1].ParameterType)!;
        var registry = Activator.CreateInstance(domains.GetType("at9", true)!)!;
        var preferences = Activator.CreateInstance(units.GetType("af3", true)!)!;
        engine.GetType("uz", true)!.GetMethods().Single(m => m.Name == "a" && m.GetParameters().Length == 3 &&
            m.GetParameters()[0].ParameterType.Name == "at9" && m.GetParameters()[2].ParameterType == typeof(bool))
            .Invoke(null, new[] {registry, preferences, false});
        var seed = engine.GetType("rs", true)!.GetMethods().Single(m => m.Name == "a" && m.GetParameters().Length == 2 &&
            m.GetParameters()[0].ParameterType.Name == "auc" && m.ReturnType == typeof(void));
        var samples = Directory.EnumerateFiles(Path.Combine(directory, "User"), "*.pcp").OrderBy(p => p).ToArray();
        if (samples.Length == 0) throw new InvalidDataException("No bundled sample projects found");
        var records = new List<object>();
        var failed = 0;
        var equipmentCount = 0;
        foreach (var sample in samples) {
            var digest = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sample))).ToLowerInvariant();
            var result = RuntimePaths.Attempt(() => {
                seed.Invoke(null, new[] {profiles, registry});
                var project = parse.Invoke(Activator.CreateInstance(reader), new object[] {sample, profiles})!;
                var equipment = (IEnumerable)project.GetType().GetMethod("f", Type.EmptyTypes)!.Invoke(project, null)!;
                var definitions = new List<object?>();
                foreach (var item in equipment) definitions.Add(Snapshot(item));
                equipmentCount += definitions.Count;
                return new {equipmentCount = definitions.Count, equipmentDefinitions = definitions};
            });
            if ((string?)result.GetType().GetProperty("status")!.GetValue(result) != "success") failed++;
            if (digest != Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(sample))).ToLowerInvariant())
                throw new IOException("Sample source changed during read");
            records.Add(new {file = Path.GetFileName(sample), sha256 = digest, sourceUnchanged = true, result});
        }
        var json = JsonSerializer.Serialize(new {
            scope = "parsed SAMPLE equipment-definition containers; may be unpopulated; NOT catalog rows or simulation results",
            unitNormalizationVerified = false, completeCatalog = false,
            rawPropertyValues = true, sampleCount = samples.Length, equipmentCount, failedSamples = failed, samples = records
        }, new JsonSerializerOptions {WriteIndented = true, NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals});
        File.WriteAllText(reportPath, json);
        Console.WriteLine($"Samples: {samples.Length}, embedded equipment: {equipmentCount}, failures: {failed}. Raw output: {reportPath}");
        Environment.ExitCode = failed == 0 ? 0 : 1;
    }
}
