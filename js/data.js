/* data.js — constants, offline cache, curated builds */

const DD = "https://ddragon.leagueoflegends.com";
const CD = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1";
const JUNK = /ward|totem|scrying|farsight|poro|soul anchor|potion|elixir|juice|loaf|cookie|oracle lens|effigy|hatchling|eyeballer|lens/i;

/* offline cache: [id, name] verified vs Data Dragon 16.15 */
const OFF_ITEMS = [
  [6655,"Luden's Echo"],[773020,"Sorcerer's Shoes"],[4645,"Shadowflame"],[773089,"Rabadon's Deathcap"],
  [773157,"Zhonya's Hourglass"],[773135,"Void Staff"],[773165,"Morellonomicon"],[773102,"Banshee's Veil"],
  [773151,"Liandry's Torment"],[4629,"Cosmic Drive"],[4646,"Stormsurge"],[773100,"Lich Bane"],
  [773115,"Nashor's Tooth"],[3152,"Hextech Rocketbelt"],[773116,"Rylai's Crystal Scepter"],
  [6699,"Voltaic Cyclosword"],[773158,"Ionian Boots of Lucidity"],[6696,"Axiom Arc"],
  [6694,"Serylda's Grudge"],[773142,"Youmuu's Ghostblade"],[3814,"Edge of Night"],
  [3179,"Umbral Glaive"],[773156,"Maw of Malmortius"],[773026,"Guardian Angel"],
  [6695,"Serpent's Fang"],[6692,"Eclipse"],[773153,"Blade of the Ruined King"],
  [773006,"Berserker's Greaves"],[6673,"Immortal Shieldbow"],[773031,"Infinity Edge"],
  [6333,"Death's Dance"],[773046,"Phantom Dancer"],[3036,"Lord Dominik's Regards"],
  [773139,"Mercurial Scimitar"],[3033,"Mortal Reminder"],[6672,"Kraken Slayer"],
  [3072,"Bloodthirster"],[6631,"Stridebreaker"],[3047,"Plated Steelcaps"],
  [3071,"Black Cleaver"],[3742,"Dead Man's Plate"],[773064,"Force of Nature"],
  [3053,"Sterak's Gage"],[773065,"Spirit Visage"],[773075,"Thornmail"],
  [663193,"Gargoyle Stoneplate"],[6610,"Sundered Sky"],[3068,"Sunfire Aegis"],
  [773111,"Mercury's Treads"],[3161,"Spear of Shojin"],[6665,"Jak'Sho, The Protean"],
  [2523,"Hexoptics C44"],[773085,"Runaan's Hurricane"],[3032,"Yun Tal Wildarrows"],
  [667666,"The Collector"],[3094,"Rapid Firecannon"],[773124,"Guinsoo's Rageblade"],
  [3302,"Terminus"],[773091,"Wit's End"],[773078,"Trinity Force"],[773042,"Muramana"],
  [773110,"Frozen Heart"],[773143,"Randuin's Omen"],[2504,"Kaenic Rookern"],
  [6664,"Hollow Radiance"],[4633,"Riftmaker"],[773190,"Locket of the Iron Solari"],
  [323050,"Zeke's Convergence"],[323109,"Knight's Vow"],[4005,"Imperial Mandate"],
  [323107,"Redemption"],[773504,"Ardent Censer"],[323222,"Mikael's Blessing"],
  [6621,"Dawncore"],[6617,"Moonstone Renewer"],[6616,"Staff of Flowing Water"],
  [3011,"Chemtech Putrifier"],[773087,"Statikk Shiv"],[3118,"Malignance"],
  [4628,"Horizon Focus"],[773040,"Seraph's Embrace"],[4636,"Night Harvester"],
  [4637,"Demonic Embrace"],[3748,"Titanic Hydra"],[773074,"Ravenous Hydra"],
  [6698,"Profane Hydra"],[3181,"Hullbreaker"],[6609,"Chempunk Chainsword"],
  [773009,"Boots of Swiftness"],[3508,"Essence Reaver"]
];

const OFF_CHAMPS = {
  "Ahri":["Ahri","103"],"Lux":["Lux","99"],"Syndra":["Syndra","134"],
  "Orianna":["Orianna","61"],"Viktor":["Viktor","112"],"Brand":["Brand","63"],
  "Veigar":["Veigar","45"],"Katarina":["Katarina","55"],"Ekko":["Ekko","245"],
  "Zed":["Zed","238"],"Kha'Zix":["Khazix","121"],"Talon":["Talon","91"],
  "Yasuo":["Yasuo","157"],"Yone":["Yone","777"],"Garen":["Garen","86"],
  "Darius":["Darius","122"],"Sett":["Sett","875"],"Mordekaiser":["Mordekaiser","82"],
  "Aatrox":["Aatrox","266"],"Jinx":["Jinx","222"],"Ashe":["Ashe","22"],
  "Caitlyn":["Caitlyn","51"],"Miss Fortune":["MissFortune","21"],"Kai'Sa":["Kaisa","145"],
  "Ezreal":["Ezreal","81"],"Vayne":["Vayne","67"],"Malphite":["Malphite","54"],
  "Ornn":["Ornn","516"],"Amumu":["Amumu","32"],"Thresh":["Thresh","412"],
  "Lulu":["Lulu","117"]
};

/* curated builds (core = purchase order 1→6, sit = popular alternates) */
const BUILDS = [
  {ch:"Ahri",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Shadowflame","Rabadon's Deathcap","Zhonya's Hourglass","Void Staff"],sit:["Morellonomicon","Banshee's Veil","Liandry's Torment","Cosmic Drive"]}]},
  {ch:"Lux",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Shadowflame","Rabadon's Deathcap","Void Staff","Zhonya's Hourglass"],sit:["Liandry's Torment","Morellonomicon","Banshee's Veil","Stormsurge"]}]},
  {ch:"Syndra",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Shadowflame","Rabadon's Deathcap","Zhonya's Hourglass","Void Staff"],sit:["Morellonomicon","Banshee's Veil","Stormsurge","Cosmic Drive"]}]},
  {ch:"Orianna",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Shadowflame","Rabadon's Deathcap","Void Staff","Zhonya's Hourglass"],sit:["Morellonomicon","Banshee's Veil","Liandry's Torment","Cosmic Drive"]}]},
  {ch:"Viktor",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Lich Bane","Shadowflame","Rabadon's Deathcap","Void Staff"],sit:["Zhonya's Hourglass","Morellonomicon","Banshee's Veil","Liandry's Torment"]}]},
  {ch:"Brand",role:"Mid",builds:[{core:["Liandry's Torment","Sorcerer's Shoes","Rylai's Crystal Scepter","Shadowflame","Morellonomicon","Rabadon's Deathcap"],sit:["Zhonya's Hourglass","Void Staff","Stormsurge","Cosmic Drive"]}]},
  {ch:"Veigar",role:"Mid",builds:[{core:["Luden's Echo","Sorcerer's Shoes","Shadowflame","Rabadon's Deathcap","Zhonya's Hourglass","Void Staff"],sit:["Banshee's Veil","Morellonomicon","Stormsurge","Cosmic Drive"]}]},
  {ch:"Katarina",role:"Mid",builds:[
    {core:["Lich Bane","Sorcerer's Shoes","Shadowflame","Zhonya's Hourglass","Rabadon's Deathcap","Stormsurge"],sit:["Nashor's Tooth","Morellonomicon","Banshee's Veil","Void Staff"]},
    {core:["Hextech Rocketbelt","Sorcerer's Shoes","Shadowflame","Zhonya's Hourglass","Rabadon's Deathcap","Void Staff"],sit:["Nashor's Tooth","Morellonomicon","Banshee's Veil","Stormsurge"]}]},
  {ch:"Ekko",role:"Jungle",builds:[
    {core:["Hextech Rocketbelt","Sorcerer's Shoes","Lich Bane","Zhonya's Hourglass","Shadowflame","Rabadon's Deathcap"],sit:["Stormsurge","Morellonomicon","Cosmic Drive","Banshee's Veil"]},
    {core:["Lich Bane","Sorcerer's Shoes","Shadowflame","Zhonya's Hourglass","Rabadon's Deathcap","Void Staff"],sit:["Stormsurge","Morellonomicon","Cosmic Drive","Banshee's Veil"]}]},
  {ch:"Zed",role:"Mid",builds:[
    {core:["Voltaic Cyclosword","Ionian Boots of Lucidity","Axiom Arc","Serylda's Grudge","Youmuu's Ghostblade","Edge of Night"],sit:["Umbral Glaive","Maw of Malmortius","Guardian Angel","Serpent's Fang"]},
    {core:["Youmuu's Ghostblade","Ionian Boots of Lucidity","Eclipse","Edge of Night","Serpent's Fang","Serylda's Grudge"],sit:["Umbral Glaive","Maw of Malmortius","Guardian Angel","Axiom Arc"]}]},
  {ch:"Kha'Zix",role:"Jungle",builds:[
    {core:["Voltaic Cyclosword","Ionian Boots of Lucidity","Umbral Glaive","Youmuu's Ghostblade","Edge of Night","Serylda's Grudge"],sit:["Eclipse","Serpent's Fang","Maw of Malmortius","Guardian Angel"]},
    {core:["Eclipse","Ionian Boots of Lucidity","Umbral Glaive","Youmuu's Ghostblade","Edge of Night","Serylda's Grudge"],sit:["Serpent's Fang","Axiom Arc","Maw of Malmortius","Guardian Angel"]}]},
  {ch:"Talon",role:"Mid",builds:[
    {core:["Youmuu's Ghostblade","Ionian Boots of Lucidity","Voltaic Cyclosword","Edge of Night","Serylda's Grudge","Serpent's Fang"],sit:["Eclipse","Umbral Glaive","Maw of Malmortius","Guardian Angel"]},
    {core:["Youmuu's Ghostblade","Ionian Boots of Lucidity","Eclipse","Edge of Night","Serylda's Grudge","Serpent's Fang"],sit:["Umbral Glaive","Axiom Arc","Maw of Malmortius","Guardian Angel"]}]},
  {ch:"Yasuo",role:"Mid",builds:[
    {core:["Blade of the Ruined King","Berserker's Greaves","Immortal Shieldbow","Infinity Edge","Death's Dance","Guardian Angel"],sit:["Phantom Dancer","Lord Dominik's Regards","Mercurial Scimitar","Mortal Reminder"]},
    {core:["Kraken Slayer","Berserker's Greaves","Infinity Edge","Phantom Dancer","Bloodthirster","Guardian Angel"],sit:["Death's Dance","Mercurial Scimitar","Lord Dominik's Regards","Mortal Reminder"]}]},
  {ch:"Yone",role:"Mid",builds:[
    {core:["Kraken Slayer","Berserker's Greaves","Infinity Edge","Phantom Dancer","Death's Dance","Guardian Angel"],sit:["Immortal Shieldbow","Bloodthirster","Mercurial Scimitar","Lord Dominik's Regards"]},
    {core:["Blade of the Ruined King","Berserker's Greaves","Immortal Shieldbow","Infinity Edge","Death's Dance","Guardian Angel"],sit:["Phantom Dancer","Mercurial Scimitar","Lord Dominik's Regards","Mortal Reminder"]}]},
  {ch:"Garen",role:"Top",builds:[
    {core:["Stridebreaker","Plated Steelcaps","Black Cleaver","Dead Man's Plate","Force of Nature","Sterak's Gage"],sit:["Spirit Visage","Thornmail","Gargoyle Stoneplate","Sundered Sky"]},
    {core:["Sunfire Aegis","Plated Steelcaps","Black Cleaver","Dead Man's Plate","Force of Nature","Gargoyle Stoneplate"],sit:["Sterak's Gage","Spirit Visage","Thornmail","Stridebreaker"]}]},
  {ch:"Darius",role:"Top",builds:[
    {core:["Stridebreaker","Plated Steelcaps","Black Cleaver","Sterak's Gage","Force of Nature","Dead Man's Plate"],sit:["Sundered Sky","Spirit Visage","Thornmail","Gargoyle Stoneplate"]},
    {core:["Sundered Sky","Plated Steelcaps","Black Cleaver","Sterak's Gage","Spirit Visage","Dead Man's Plate"],sit:["Stridebreaker","Thornmail","Gargoyle Stoneplate","Force of Nature"]}]},
  {ch:"Sett",role:"Top",builds:[
    {core:["Stridebreaker","Plated Steelcaps","Sterak's Gage","Dead Man's Plate","Force of Nature","Black Cleaver"],sit:["Sundered Sky","Gargoyle Stoneplate","Spirit Visage","Thornmail"]},
    {core:["Sundered Sky","Plated Steelcaps","Sterak's Gage","Dead Man's Plate","Black Cleaver","Force of Nature"],sit:["Stridebreaker","Gargoyle Stoneplate","Spirit Visage","Thornmail"]}]},
  {ch:"Mordekaiser",role:"Top",builds:[{core:["Liandry's Torment","Sorcerer's Shoes","Rylai's Crystal Scepter","Shadowflame","Zhonya's Hourglass","Morellonomicon"],sit:["Rabadon's Deathcap","Void Staff","Riftmaker","Cosmic Drive"]}]},
  {ch:"Aatrox",role:"Top",builds:[
    {core:["Spear of Shojin","Plated Steelcaps","Sundered Sky","Death's Dance","Sterak's Gage","Spirit Visage"],sit:["Black Cleaver","Thornmail","Gargoyle Stoneplate","Jak'Sho, The Protean"]},
    {core:["Sundered Sky","Mercury's Treads","Black Cleaver","Death's Dance","Spirit Visage","Sterak's Gage"],sit:["Spear of Shojin","Thornmail","Gargoyle Stoneplate","Stridebreaker"]}]},
  {ch:"Jinx",role:"ADC",builds:[
    {core:["Hexoptics C44","Berserker's Greaves","Infinity Edge","Phantom Dancer","Runaan's Hurricane","Lord Dominik's Regards"],sit:["Yun Tal Wildarrows","The Collector","Guardian Angel","Mortal Reminder"]},
    {core:["Kraken Slayer","Berserker's Greaves","Infinity Edge","Runaan's Hurricane","Phantom Dancer","Lord Dominik's Regards"],sit:["The Collector","Guardian Angel","Bloodthirster","Mortal Reminder"]}]},
  {ch:"Ashe",role:"ADC",builds:[
    {core:["Kraken Slayer","Berserker's Greaves","Runaan's Hurricane","Infinity Edge","Rapid Firecannon","Lord Dominik's Regards"],sit:["Hexoptics C44","Yun Tal Wildarrows","Bloodthirster","Mercurial Scimitar"]},
    {core:["Hexoptics C44","Berserker's Greaves","Infinity Edge","Runaan's Hurricane","Rapid Firecannon","Lord Dominik's Regards"],sit:["Yun Tal Wildarrows","Bloodthirster","Mercurial Scimitar","Guardian Angel"]}]},
  {ch:"Caitlyn",role:"ADC",builds:[
    {core:["Hexoptics C44","Berserker's Greaves","Infinity Edge","Rapid Firecannon","Lord Dominik's Regards","Bloodthirster"],sit:["Yun Tal Wildarrows","Guardian Angel","Mercurial Scimitar","Mortal Reminder"]},
    {core:["Kraken Slayer","Berserker's Greaves","Rapid Firecannon","Infinity Edge","Lord Dominik's Regards","Bloodthirster"],sit:["Guardian Angel","Mercurial Scimitar","Yun Tal Wildarrows","Mortal Reminder"]}]},
  {ch:"Miss Fortune",role:"ADC",builds:[
    {core:["Kraken Slayer","Ionian Boots of Lucidity","The Collector","Infinity Edge","Essence Reaver","Lord Dominik's Regards"],sit:["Yun Tal Wildarrows","Hexoptics C44","Bloodthirster","Guardian Angel"]},
    {core:["Youmuu's Ghostblade","Ionian Boots of Lucidity","Eclipse","Umbral Glaive","Serylda's Grudge","Edge of Night"],sit:["The Collector","Guardian Angel","Maw of Malmortius","Serpent's Fang"]}]},
  {ch:"Kai'Sa",role:"ADC",builds:[
    {core:["Kraken Slayer","Berserker's Greaves","Guinsoo's Rageblade","Nashor's Tooth","Terminus","Lord Dominik's Regards"],sit:["Guardian Angel","Mercurial Scimitar","Bloodthirster","Mortal Reminder"]},
    {core:["Kraken Slayer","Berserker's Greaves","Runaan's Hurricane","Infinity Edge","Guinsoo's Rageblade","Lord Dominik's Regards"],sit:["Guardian Angel","Mercurial Scimitar","Nashor's Tooth","Mortal Reminder"]}]},
  {ch:"Ezreal",role:"ADC",builds:[
    {core:["Trinity Force","Ionian Boots of Lucidity","Muramana","Spear of Shojin","Serylda's Grudge","Guardian Angel"],sit:["Bloodthirster","Maw of Malmortius","Edge of Night","Serpent's Fang"]},
    {core:["Trinity Force","Ionian Boots of Lucidity","Muramana","Serylda's Grudge","Guardian Angel","Serpent's Fang"],sit:["Spear of Shojin","Bloodthirster","Maw of Malmortius","Edge of Night"]}]},
  {ch:"Vayne",role:"ADC",builds:[
    {core:["Blade of the Ruined King","Berserker's Greaves","Guinsoo's Rageblade","Terminus","Wit's End","Jak'Sho, The Protean"],sit:["Phantom Dancer","Mercurial Scimitar","Lord Dominik's Regards","Guardian Angel"]},
    {core:["Blade of the Ruined King","Berserker's Greaves","Guinsoo's Rageblade","Wit's End","Phantom Dancer","Guardian Angel"],sit:["Terminus","Mercurial Scimitar","Lord Dominik's Regards","Jak'Sho, The Protean"]}]},
  {ch:"Malphite",role:"Top",builds:[
    {core:["Sunfire Aegis","Plated Steelcaps","Thornmail","Frozen Heart","Jak'Sho, The Protean","Randuin's Omen"],sit:["Spirit Visage","Force of Nature","Gargoyle Stoneplate","Kaenic Rookern"]},
    {core:["Sunfire Aegis","Plated Steelcaps","Thornmail","Frozen Heart","Randuin's Omen","Spirit Visage"],sit:["Jak'Sho, The Protean","Force of Nature","Gargoyle Stoneplate","Hollow Radiance"]}]},
  {ch:"Ornn",role:"Top",builds:[{core:["Sunfire Aegis","Plated Steelcaps","Thornmail","Frozen Heart","Force of Nature","Randuin's Omen"],sit:["Jak'Sho, The Protean","Spirit Visage","Gargoyle Stoneplate","Hollow Radiance"]}]},
  {ch:"Amumu",role:"Jungle",builds:[{core:["Sunfire Aegis","Plated Steelcaps","Thornmail","Frozen Heart","Spirit Visage","Randuin's Omen"],sit:["Jak'Sho, The Protean","Force of Nature","Gargoyle Stoneplate","Kaenic Rookern"]}]},
  {ch:"Thresh",role:"Support",builds:[{core:["Locket of the Iron Solari","Mercury's Treads","Zeke's Convergence","Knight's Vow","Randuin's Omen","Thornmail"],sit:["Frozen Heart","Spirit Visage","Gargoyle Stoneplate","Dead Man's Plate"]}]},
  {ch:"Lulu",role:"Support",builds:[
    {core:["Imperial Mandate","Ionian Boots of Lucidity","Redemption","Ardent Censer","Mikael's Blessing","Dawncore"],sit:["Moonstone Renewer","Staff of Flowing Water","Chemtech Putrifier","Locket of the Iron Solari"]},
    {core:["Moonstone Renewer","Ionian Boots of Lucidity","Ardent Censer","Redemption","Staff of Flowing Water","Mikael's Blessing"],sit:["Imperial Mandate","Chemtech Putrifier","Dawncore","Locket of the Iron Solari"]}]}
];

const ALIAS = {
  "Luden's Echo": ["Luden's Companion", "Luden's Tempest"],
  "Liandry's Torment": ["Liandry's Anguish"]
};

/* all item names referenced by the dataset (force-included in pool) */
const BUILD_NAMES = (() => {
  const s = new Set();
  BUILDS.forEach(e => e.builds.forEach(b => {
    b.core.forEach(n => s.add(n));
    (b.sit || []).forEach(n => s.add(n));
  }));
  Object.entries(ALIAS).forEach(([k, v]) => { s.add(k); v.forEach(n => s.add(n)); });
  return [...s];
})();

/**
 * Get hardcoded build for a champion by name
 * @param {string} championName - Champion name
 * @returns {Object|null} Build entry or null if not found
 */
function getHardcodedBuild(championName) {
  const normalized = norm(championName);
  for (const entry of BUILDS) {
    if (norm(entry.ch) === normalized) {
      return entry;
    }
  }
  return null;
}
