using CUE4Parse.FileProvider;
using CUE4Parse.UE4.Versions;
using CUE4Parse.MappingsProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SkiaSharp;

// Usage:
//   dotnet run <gameContentPaksDir> <usmapPath> <outDir>                 (define tables -> JSON)
//   dotnet run <gameContentPaksDir> <usmapPath> <outDir> <textureList>   (Texture2D -> PNG)
var paksDir = args[0];
var usmapPath = args[1];
var outDir = args[2];
var textureList = args.Length > 3 ? args[3] : null;

var provider = new DefaultFileProvider(paksDir, SearchOption.TopDirectoryOnly,
    new VersionContainer(EGame.GAME_UE5_7));
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmapPath);
if (Environment.GetEnvironmentVariable("CUE4_READ_SCRIPT") == "1")
    provider.ReadScriptData = true;
provider.Initialize();
provider.Mount();

Directory.CreateDirectory(outDir);

if (textureList != null)
{
    int tok = 0, tfail = 0;
    foreach (var line in File.ReadAllLines(textureList))
    {
        var assetPath = line.Trim();
        if (assetPath.Length == 0 || assetPath.StartsWith('#')) continue;
        try
        {
            var texture = provider.LoadPackage(assetPath).GetExports().OfType<UTexture2D>().First();
            var bitmap = texture.Decode() ?? throw new Exception("decode returned null");
            var pngPath = Path.Combine(outDir, Path.GetFileNameWithoutExtension(assetPath) + ".png");
            var data = bitmap.Encode(CUE4Parse_Conversion.Textures.ETextureFormat.Png, false, out _);
            File.WriteAllBytes(pngPath, data);
            tok++;
        }
        catch (Exception e)
        {
            tfail++;
            Console.Error.WriteLine($"FAIL {assetPath}: {e.Message}");
        }
    }
    Console.WriteLine($"Decoded {tok} textures, {tfail} failures, to {outDir}");
    return;
}

// Optional override, e.g. CUE4_PREFIXES="twilightModernity/Content/Blueprints/Widgets/"
string[] prefixes = Environment.GetEnvironmentVariable("CUE4_PREFIXES")?.Split(',')
    ?? [
        "twilightModernity/Content/Blueprints/Struct/Defines/",
        "twilightModernity/Content/Blueprints/Struct/Enum/",
    ];
var starMapMode = Environment.GetEnvironmentVariable("CUE4_STARMAP") == "1";

int ok = 0, fail = 0;
foreach (var (path, _) in provider.Files)
{
    var prefix = Array.Find(prefixes, p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));
    if (prefix == null) continue;
    if (!path.EndsWith(".uasset", StringComparison.OrdinalIgnoreCase)
        && !path.EndsWith(".umap", StringComparison.OrdinalIgnoreCase)) continue;
    if (starMapMode
        && !Path.GetFileNameWithoutExtension(path).Equals("TopDownExampleMap", StringComparison.OrdinalIgnoreCase)) continue;
    var rel = prefix.EndsWith("Enum/") ? "Enum/" + path.Substring(prefix.Length) : path.Substring(prefix.Length);
    if (rel.Length == 0 || rel.StartsWith('.')) rel = Path.GetFileName(path);
    var outPath = Path.Combine(outDir, Path.ChangeExtension(rel, ".json"));
    Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
    try
    {
        var pkg = provider.LoadPackage(path);
        var exports = pkg.GetExports().ToArray();
        if (starMapMode)
        {
            // Planets.json contains simulation ids, not the names shown to the
            // player. Those live on the celestial actors in the star-map level.
            // Keep only the small, stable subset normalization needs rather than
            // committing the full multi-megabyte map export.
            var actors = exports
                .Select(export => JObject.Parse(JsonConvert.SerializeObject(export)))
                .Select(node =>
                {
                    var properties = node["Properties"] as JObject;
                    return new
                    {
                        Type = node["Type"]?.Value<string>(),
                        Name = node["Name"]?.Value<string>(),
                        ActorLabel = node["ActorLabel"]?.Value<string>(),
                        Tag = properties?["Tag"]?.Value<string>(),
                        CosmeticTag = properties?["CosmeticTag"]?.Value<string>(),
                        DisplayName = properties?["DisplayName"]?.Value<string>(),
                        OrbitalParent = properties?["OrbitalParent"]?["ObjectName"]?.Value<string>(),
                    };
                })
                .Where(actor => !string.IsNullOrWhiteSpace(actor.Tag)
                    && !string.IsNullOrWhiteSpace(actor.DisplayName))
                .ToArray();
            if (actors.Length == 0) continue;
            File.WriteAllText(outPath, JsonConvert.SerializeObject(actors, Formatting.Indented));
        }
        else
        {
            File.WriteAllText(outPath, JsonConvert.SerializeObject(exports, Formatting.Indented));
        }
        ok++;
    }
    catch (Exception e)
    {
        fail++;
        Console.Error.WriteLine($"FAIL {rel}: {e.Message}");
    }
}
Console.WriteLine($"Exported {ok} assets, {fail} failures, to {outDir}");
