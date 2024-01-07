import { randomChoice } from "../../shared/utils"

export function generateCityName(capital: boolean) {
    const prefixes = [
        "New ",
        "Old ",
        capital ? "Great " : "Bad ",
        "Los ",
        "Las ",
        "La ",
        "St. ",
        "Port ",
        "San ",
    ]

    const firstParts = [
        "Lon",
        "New",
        "Old",
        "York",
        "Ham",
        "Birm",
        "South",
        "North",
        "East",
        "West",
        "Hemp",
        "Bright",
        "Stein",
        "Berg",
        capital ? "Kaisers" : "Klein",
        "Groß",
        "Bad",
        "Schön",
        "Schwarz",
        "Stras",
        "Darm",
        "Dürk",
        "Ber",
        "Dres",
        "Ober",
        capital ? "Über" : "Unter",
        "Hoch",
        "Nieder",
        "Ven",
        "Mün",
        "Lei",
        "Eppel",
        "Man",
        "Wash",
        "Mos",
        "Dub",
        "Peter",
        "Kan",
        "San",
        "Zwick",
        "Wein",
        "Heid",
        "Glas",
        "Sand",
        "Han",
        "Aug",
        "Nürn",
        "Par",
        "Mon",
        "Neu",
        "Haupt",
        "Lud",
        "Kop",
        "Wen",
        "Würz",
        "Karl",
        "Ros",
        "Mag",
        "Nürt",
        "Es",
        "Frei",
        "Köl",
        "Ot",
        "Eis",
        "Mei",
        "Schmal",
        "Liv",
        "Dun",
        "Braun",
        "Kil",
        "Whit",
        "Vil",
        "Bil",
        "Reut",
        "Ko",
        "Jen",
        "Am",
        "Ein",
        "Zü",
        "Zwei",
        "Tü",
        "Alt",
        "Grün",
        "Schlecht",
        "Gut",
        "Feld",
        "Freu",
        "Don",
        "Lim",
        "Har",
        "Del",
        "Salz",
        "Wis",
        "Wei",
        "Can",
        "Per",
        "Mel",
        "Kin",
        "Water",
        "Win",
        "Swan",
        "Stock",
        "Lut",
        "Gen",
        "Ger",
        "Nan",
        "Val",
        "Met",
        "Hinter",
    ]

    const middleParts = [
        "ing",
        "wester",
        "brook",
        "brück",
        "as",
        "wald",
        "er",
        "ober",
        "unter",
        "e",
        "i",
        "o",
        "s",
        "t",
        "li",
        "is",
        "bo",
        "sen",
        "kirch",
        "orz",
        "el",
        "tur",
        "ers",
        "wigs",
        "lau",
        "leu",
        "de",
        "ster",
        "sied",
        "mitt",
        "ring",
        "feld",
        "grenz",
        "chen",
        "mans",
        "na",
        "ber",
        "min",
        "ent",
        "ro",
        "amp",
        "hamp",
        "castle",
        "sil",
    ]

    const endParts = [
        "don",
        "ville",
        "burg",
        "town",
        "hausen",
        "heim",
        "lingen",
        "ingen",
        "berg",
        "furt",
        "kirchen",
        "ton",
        "ham",
        "wick",
        "wich",
        "stadt",
        "lin",
        "zig",
        "dorf",
        capital ? "burg" : "bach",
        "bourg",
        "brück",
        "bruck",
        "ster",
        "chen",
        "born",
        "ford",
        "as",
        "ow",
        "au",
        "weiler",
        "tal",
        "ia",
        "port",
        "castle",
        "hafen",
        "hagen",
        "del",
        "tock",
        "tern",
        "gart",
        "bury",
        "lenz",
        "na",
        "dam",
        "ich",
        "a",
        "ten",
        "pool",
        "itz",
        "tzen",
        "horst",
        "mar",
        "sund",
        "loh",
        "ra",
        "th",
        "da",
        "are",
        "ise",
        "ais",
        "ick",
        "iff",
        "sea",
        "holm",
        "by",
        "stad",
        "und",
        "ala",
        "tia",
        "mo",
        "el",
        "in",
        "ach",
        "cy",
        "es",
        "aire",
        "wil",
        "on",
        "ly",
        "ey",
        "lona",
        "ino",
    ]

    let prefix = ""
    let middle = ""
    if (Math.random() < (capital ? 0.3 : 0.1)) {
        prefix = randomChoice(prefixes)
    }
    if (Math.random() < (capital ? 0.2 : 0.4)) {
        middle = randomChoice(middleParts)
    }

    return prefix + randomChoice(firstParts) + middle + randomChoice(endParts)
}