using System.IO;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;

internal static class RuntimePaths
{
    private static string? SafeStack(Exception error)
    {
        try { return error.StackTrace; }
        catch { return "Stack unavailable due to missing dependency."; }
    }

    internal static object Attempt(Func<object?> action)
    {
        try { return new {status = "success", result = action()}; }
        catch (Exception error) {
            var errors = new List<object>();
            for (Exception? e = error; e != null; e = e.InnerException)
                errors.Add(new {type = e.GetType().FullName, message = e.Message, stack = SafeStack(e)});
            return new {status = "blocked", errors};
        }
    }

    internal static void Run(string directory, string output)
    {
        Directory.CreateDirectory(output);
        Assembly Load(string name) => AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(directory, name));
        var report = new Dictionary<string, object?>();
        report["scope"] = "original loader attempts; no license patching, dependency stubs or bypasses";
        report["catalog"] = Attempt(() => {
            // Work on a copy so the distributed equipment database remains untouched.
            var copy = Path.Combine(output, "equipment-probe.db");
            File.Copy(Path.Combine(directory, "equipment.db"), copy, true);
            var data = Load("pcpump.data.dll");
            var type = data.GetType("q5", true)!;
            using var database = Activator.CreateInstance(type, new object[] {copy, true}) as IDisposable;
            return new {opened = database != null, type = type.FullName};
        });
        report["sampleProject"] = Attempt(() => {
            var binary = Load("pcpump.binary.dll");
            var reader = binary.GetType("la", true)!;
            var method = reader.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Single(m => m.Name == "a" && m.GetParameters().Length == 2 && m.GetParameters()[0].ParameterType == typeof(string));
            var warningsType = method.GetParameters()[1].ParameterType;
            var warningList = Activator.CreateInstance(warningsType);
            // Match the desktop's a5.a path: populate profiles using original helpers.
            // auc is an analysis-profile collection, not a generic warnings list.
            var engine = Load("pcpump.engine.dll");
            var domains = Load("pcpump.domains.dll");
            var units = Load("cfer.units.dll");
            var preferences = Activator.CreateInstance(units.GetType("af3", true)!);
            var registry = Activator.CreateInstance(domains.GetType("at9", true)!);
            var initialize = engine.GetType("uz", true)!.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Single(m => m.Name == "a" && m.GetParameters().Length == 3 &&
                    m.GetParameters()[0].ParameterType.Name == "at9" && m.GetParameters()[2].ParameterType == typeof(bool));
            initialize.Invoke(null, new object?[] {registry, preferences, false});
            var seed = engine.GetType("rs", true)!.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Single(m => m.Name == "a" && m.GetParameters().Length == 2 &&
                    m.GetParameters()[0].ParameterType.Name == "auc" && m.ReturnType == typeof(void));
            seed.Invoke(null, new object?[] {warningList, registry});
            var instance = Activator.CreateInstance(reader);
            var samples = new List<object>();
            var failures = 0;
            foreach (var sample in Directory.EnumerateFiles(directory, "ss*.pcp").OrderBy(p => p)) {
                var captured = Attempt(() => {
                    // The original seeder clears and repopulates the collection for each project.
                    seed.Invoke(null, new object?[] {warningList, registry});
                    var project = method.Invoke(instance, new object?[] {sample, warningList})
                        ?? throw new InvalidOperationException("Original parser returned null");
                    object? Getter(string name) => project.GetType().GetMethod(name, Type.EmptyTypes)!.Invoke(project, null);
                    var equipment = Getter("f") as System.Collections.IEnumerable;
                    var equipmentTypes = new List<string>();
                    if (equipment != null) foreach (var item in equipment) equipmentTypes.Add(item.GetType().FullName!);
                    var analyses = Getter("h") as System.Collections.ICollection;
                    var profiles = Getter("g") as System.Collections.ICollection;
                    return new {loaded = true, projectType = project.GetType().FullName,
                        analysisCount = analyses?.Count, profileCount = profiles?.Count,
                        embeddedEquipmentCount = equipmentTypes.Count, embeddedEquipmentTypes = equipmentTypes};
                });
                if ((string?)captured.GetType().GetProperty("status")!.GetValue(captured) != "success") failures++;
                samples.Add(new {file = Path.GetFileName(sample), result = captured});
            }
            File.WriteAllText(Path.Combine(output, "sample-projects.json"), JsonSerializer.Serialize(samples, new JsonSerializerOptions {WriteIndented = true}));
            if (samples.Count == 0 || failures > 0) throw new InvalidOperationException($"Sample parsing incomplete: {failures} failed of {samples.Count}. See sample-projects.json.");
            return new {scope = "sample parsing and collection counts only; not simulation or complete manufacturer catalog", sampleCount = samples.Count, samples};
        });
        report["simulationRequirements"] = Attempt(() => {
            var engine = Load("pcpump.engine.dll");
            var entry = engine.GetType("r9", true)!.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Single(m => m.Name == "a" && m.GetParameters().Length == 7 && m.GetParameters()[0].ParameterType == typeof(bool));
            return new {executed = false, entry = entry.ToString(),
                parameters = entry.GetParameters().Select(p => new {
                    name = p.Name, type = p.ParameterType.FullName, assembly = p.ParameterType.Assembly.GetName().Name,
                    isInterface = p.ParameterType.IsInterface, isAbstract = p.ParameterType.IsAbstract,
                    constructors = p.ParameterType.GetConstructors().Select(c => c.ToString()).ToArray()
                }).ToArray(),
                reason = "Catalog and normal application/security contexts are not initialized; no fake contexts supplied."};
        });
        report["desktopResources"] = Attempt(() => {
            var app = Load("pcpump.dll");
            var names = new List<object>();
            foreach (var resource in app.GetManifestResourceNames()) {
                if (!resource.EndsWith(".g.resources", StringComparison.OrdinalIgnoreCase)) continue;
                using var stream = app.GetManifestResourceStream(resource)!;
                using var reader = new System.Resources.ResourceReader(stream);
                var items = reader.GetEnumerator();
                while (items.MoveNext()) {
                    var name = (string)items.Key;
                    reader.GetResourceData(name, out var resourceType, out var bytes);
                    names.Add(new {name, resourceType, byteCount = bytes.Length});
                }
            }
            return new {resources = names, scope = "resource names and lengths only; no asset copies or visual parity claims"};
        });
        report["desktop"] = Attempt(() => {
            var app = Load("pcpump.dll");
            var references = app.GetReferencedAssemblies().Select(a => a.Name).ToArray();
            var resources = app.GetManifestResourceNames();
            // Loading a concrete WPF base type tests dependency availability, not UI parity.
            var wpf = Assembly.Load("PresentationFramework");
            return new {references, resources, wpf = wpf.FullName};
        });
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions {WriteIndented = true});
        File.WriteAllText(Path.Combine(output, "runtime-paths.json"), json);
        Console.WriteLine(json);
    }
}
