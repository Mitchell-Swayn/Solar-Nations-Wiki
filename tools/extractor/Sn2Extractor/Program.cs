using System.Text;
using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

const string DefaultGameRoot =
    "/Users/mitchellswayn/Library/Application Support/CrossOver/Bottles/Steam/drive_c/Program Files (x86)/Steam/steamapps/common/Solar Nations 2/Windows/twilightModernity/Content/Paks";

var gameRoot = args.Length > 0 ? args[0] : Environment.GetEnvironmentVariable("SN2_GAME_PATH") ?? DefaultGameRoot;
var outputRoot = args.Length > 1
    ? args[1]
    : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", "..", "data", "raw"));

var definesDir = Path.Combine(outputRoot, "Defines");
var locDir = Path.Combine(outputRoot, "Localization");
Directory.CreateDirectory(definesDir);
Directory.CreateDirectory(locDir);

Console.WriteLine($"Game root: {gameRoot}");
Console.WriteLine($"Output:    {outputRoot}");

var provider = new DefaultFileProvider(
    gameRoot,
    SearchOption.TopDirectoryOnly,
    true,
    new VersionContainer(EGame.GAME_UE5_6));

provider.Initialize();
var mounted = provider.Mount();
Console.WriteLine($"Mounted {provider.Files.Count} files ({mounted} new vfs mounts)");

var sample = provider.Files.Keys.Where(k => k.Contains("GovernmentReform", StringComparison.OrdinalIgnoreCase) || k.Contains("Defines", StringComparison.OrdinalIgnoreCase) || k.Contains("resource_english", StringComparison.OrdinalIgnoreCase)).Take(30);
foreach (var key in sample) Console.WriteLine($"  found: {key}");
if (provider.Files.Count < 100)
{
    foreach (var key in provider.Files.Keys.Take(30)) Console.WriteLine($"  file: {key}");
}

var defineTargets = new[]
{
    "Factions",
    "Technologies",
    "Resources",
    "Projects",
    "Events",
    "Eras",
    "CultureTraits",
    "CharacterTraits",
    "CharacterJobs",
    "GovernmentReforms",
    "GovernmentReformOptions",
    "UnitComponents",
    "Deposits",
    "DepositResources",
    "Situations",
    "StaticModifiers",
    "FactionVariants",
};

var definePrefix = "twilightModernity/Content/Blueprints/Struct/Defines/";
var exported = 0;

foreach (var name in defineTargets)
{
    var packagePath = $"{definePrefix}{name}";
    if (!provider.Files.ContainsKey($"{packagePath}.uasset"))
    {
        Console.WriteLine($"MISSING: {packagePath}.uasset");
        continue;
    }

    try
    {
        var exportList = provider.LoadPackage(packagePath).GetExports().ToList();
        var json = JsonConvert.SerializeObject(exportList, Formatting.Indented);
        var outPath = Path.Combine(definesDir, $"{name}.json");
        await File.WriteAllTextAsync(outPath, json, Encoding.UTF8);
        Console.WriteLine($"Exported {name}: {exportList.Count} export(s) -> {outPath}");
        exported++;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"FAILED {name}: {ex.Message}");
    }
}

var locPath = "twilightModernity/Content/Localisation/English/resource_english";
if (provider.Files.ContainsKey($"{locPath}.uasset"))
{
    try
    {
        var exportList = provider.LoadPackage(locPath).GetExports().ToList();
        var json = JsonConvert.SerializeObject(exportList, Formatting.Indented);
        var outPath = Path.Combine(locDir, "en-raw.json");
        await File.WriteAllTextAsync(outPath, json, Encoding.UTF8);
        Console.WriteLine($"Exported localization -> {outPath}");

        var flat = ExtractLocalization(exportList);
        if (flat.Count > 0)
        {
            var enPath = Path.Combine(locDir, "en.json");
            await File.WriteAllTextAsync(enPath, JsonConvert.SerializeObject(flat, Formatting.Indented), Encoding.UTF8);
            Console.WriteLine($"Flattened {flat.Count} localization keys -> {enPath}");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"FAILED localization: {ex.Message}");
    }
}

var manifest = new
{
    extractedAt = DateTime.UtcNow,
    gameRoot,
    exportedDefines = exported,
    tool = "CUE4Parse extractor",
};
await File.WriteAllTextAsync(
    Path.Combine(outputRoot, "extraction-manifest.json"),
    JsonConvert.SerializeObject(manifest, Formatting.Indented),
    Encoding.UTF8);

Console.WriteLine($"Done. Exported {exported} define packages.");

static Dictionary<string, string> ExtractLocalization(IEnumerable<object> exports)
{
    var result = new Dictionary<string, string>();
    foreach (var export in exports)
    {
        var token = JToken.Parse(JsonConvert.SerializeObject(export));
        WalkForStrings(token, result);
    }
    return result;
}

static void WalkForStrings(JToken token, Dictionary<string, string> result)
{
    switch (token.Type)
    {
        case JTokenType.Object:
            var obj = (JObject)token;
            foreach (var prop in obj.Properties()) WalkForStrings(prop.Value, result);
            if (obj["Key"] is JValue { Type: JTokenType.String } key &&
                obj["SourceString"] is JValue { Type: JTokenType.String } value)
            {
                result[key.Value<string>()!] = value.Value<string>()!;
            }
            break;
        case JTokenType.Array:
            foreach (var child in token.Children()) WalkForStrings(child, result);
            break;
    }
}
