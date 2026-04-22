#!/usr/bin/env python3
"""
Generate I18n C++ files from per-language YAML translations.

Reads YAML files from a translations directory (one file per language) and generates:
\- I18nKeys.h: Language enum, StrId enum, helper functions
\- I18nStrings.h: String array declarations
\- I18nStrings.cpp: String array definitions with all translations

Each YAML file must contain:
 \_language\_name: "Native Name" (e.g. "Español")
 \_language\_code: "ENUM\_NAME" (e.g. "ES")
 STR\_KEY: "translation text"

The English file is the reference. Missing keys in other languages are
automatically filled from English, with a warning.

Usage:
 python gen\_i18n.py

Example:
 python gen\_i18n.py lib/I18n/translations lib/I18n/
"""

import sys
import os
import re
from pathlib import Path
from typing import List, Dict, Tuple

\# ---------------------------------------------------------------------------
\# YAML file reading (simple key: "value" format, no PyYAML dependency)
\# ---------------------------------------------------------------------------

def \_unescape\_yaml\_value(raw: str, filepath: str = "", line\_num: int = 0) -> str:
 """
 Process escape sequences in a YAML value string.

 Recognized escapes: \\\\\\ → \\\ \\\" → " \\\n → newline
 """
 result: List\[str\] = \[\]
 i = 0
 while i < len(raw):
 if raw\[i\] == "\\\" and i + 1 < len(raw):
 nxt = raw\[i + 1\]
 if nxt == "\\\":
 result.append("\\\")
 elif nxt == '"':
 result.append('"')
 elif nxt == "n":
 result.append("\\n")
 else:
 raise ValueError(
 f"{filepath}:{line\_num}: unknown escape '\\\{nxt}'"
 )
 i += 2
 else:
 result.append(raw\[i\])
 i += 1
 return "".join(result)

def parse\_yaml\_file(filepath: str) -> Dict\[str, str\]:
 """
 Parse a simple YAML file of the form:
 key: "value"

 Only supports flat key-value pairs with quoted string values.
 Aborts on formatting errors.
 """
 result = {}
 with open(filepath, "r", encoding="utf-8") as f:
 for line\_num, raw\_line in enumerate(f, start=1):
 line = raw\_line.rstrip("\\n\\r")

 if not line.strip():
 continue

 match = re.match(r'^(\[A-Za-z\_\]\[A-Za-z0-9\_\]\*)\\s\*:\\s\*"(.\*)"$', line)
 if not match:
 raise ValueError(
 f"{filepath}:{line\_num}: bad format: {line!r}\\n"
 f' Expected: KEY: "value"'
 )

 key = match.group(1)
 raw\_value = match.group(2)

 # Un-escape: process character by character to handle
 # \\\, \\", and \\n sequences correctly
 value = \_unescape\_yaml\_value(raw\_value, filepath, line\_num)

 if key in result:
 raise ValueError(f"{filepath}:{line\_num}: duplicate key '{key}'")

 result\[key\] = value

 return result

\# ---------------------------------------------------------------------------
\# Load all languages from a directory of YAML files
\# ---------------------------------------------------------------------------

def load\_translations(
 translations\_dir: str,
) -\> Tuple\[List\[str\], List\[str\], List\[str\], Dict\[str, List\[str\]\]\]:
 """
 Read every YAML file in \*translations\_dir\* and return:
 language\_codes e.g. \["EN", "ES", ...\]
 language\_names e.g. \["English", "Español", ...\]
 string\_keys ordered list of STR\_\* keys (from English)
 translations {key: \[translation\_per\_language\]}

 English is always first;
 """
 yaml\_dir = Path(translations\_dir)
 if not yaml\_dir.is\_dir():
 raise FileNotFoundError(f"Translations directory not found: {translations\_dir}")

 yaml\_files = sorted(yaml\_dir.glob("\*.yaml"))
 if not yaml\_files:
 raise FileNotFoundError(f"No .yaml files found in {translations\_dir}")

 # Parse every file
 parsed: Dict\[str, Dict\[str, str\]\] = {}
 for yf in yaml\_files:
 parsed\[yf.name\] = parse\_yaml\_file(str(yf))

 # Identify the English file (must exist)
 english\_file = None
 for name, data in parsed.items():
 if data.get("\_language\_code", "").upper() == "EN":
 english\_file = name
 break

 if english\_file is None:
 raise ValueError("No YAML file with \_language\_code: EN found")

 # Order: English first, then by \_order metadata (falls back to filename)
 def sort\_key(fname: str) -> Tuple\[int, int, str\]:
 """English always first (0), then by \_order, then by filename."""
 if fname == english\_file:
 return (0, 0, fname)
 order = parsed\[fname\].get("\_order", "999")
 try:
 order\_int = int(order)
 except ValueError:
 order\_int = 999
 return (1, order\_int, fname)

 ordered\_files = sorted(parsed, key=sort\_key)

 # Extract metadata
 language\_codes: List\[str\] = \[\]
 language\_names: List\[str\] = \[\]
 for fname in ordered\_files:
 data = parsed\[fname\]
 code = data.get("\_language\_code")
 name = data.get("\_language\_name")
 if not code or not name:
 raise ValueError(f"{fname}: missing \_language\_code or \_language\_name")
 language\_codes.append(code)
 language\_names.append(name)

 # String keys come from English (order matters)
 english\_data = parsed\[english\_file\]
 string\_keys = \[k for k in english\_data if not k.startswith("\_")\]

 # Validate all keys are valid C++ identifiers
 for key in string\_keys:
 if not re.match(r"^\[a-zA-Z\_\]\[a-zA-Z0-9\_\]\*$", key):
 raise ValueError(f"Invalid C++ identifier in English file: '{key}'")

 # Build translations dict, filling missing keys from English
 translations: Dict\[str, List\[str\]\] = {}
 for key in string\_keys:
 row: List\[str\] = \[\]
 for fname in ordered\_files:
 data = parsed\[fname\]
 value = data.get(key, "")
 if not value.strip() and fname != english\_file:
 value = english\_data\[key\]
 lang\_code = parsed\[fname\].get("\_language\_code", fname)
 print(f" INFO: '{key}' missing in {lang\_code}, using English fallback")
 row.append(value)
 translations\[key\] = row

 # Warn about extra keys in non-English files
 for fname in ordered\_files:
 if fname == english\_file:
 continue
 data = parsed\[fname\]
 extra = \[k for k in data if not k.startswith("\_") and k not in english\_data\]
 if extra:
 lang\_code = data.get("\_language\_code", fname)
 print(f" WARNING: {lang\_code} has keys not in English: {', '.join(extra)}")

 print(f"Loaded {len(language\_codes)} languages, {len(string\_keys)} string keys")
 return language\_codes, language\_names, string\_keys, translations

\# ---------------------------------------------------------------------------
\# C++ string escaping
\# ---------------------------------------------------------------------------

LANG\_ABBREVIATIONS = {
 "english": "EN",
 "español": "ES", "espanol": "ES",
 "italiano": "IT",
 "svenska": "SV",
 "français": "FR", "francais": "FR",
 "deutsch": "DE", "german": "DE",
 "polski": "PL",
 "português": "PT", "portugues": "PT", "português (brasil)": "PO",
 "中文": "ZH", "chinese": "ZH",
 "日本語": "JA", "japanese": "JA",
 "한국어": "KO", "korean": "KO",
 "русский": "RU", "russian": "RU",
 "العربية": "AR", "arabic": "AR",
 "עברית": "HE", "hebrew": "HE",
 "فارسی": "FA", "persian": "FA",
 "čeština": "CS",
 "türkçe": "TR", "turkish": "TR",
 "Қазақша": "KK", "kazakh": "KK",
}

def get\_lang\_abbreviation(lang\_code: str, lang\_name: str) -> str:
 """Return a 2-letter abbreviation for a language."""
 lower = lang\_name.lower()
 if lower in LANG\_ABBREVIATIONS:
 return LANG\_ABBREVIATIONS\[lower\]
 return lang\_code\[:2\].upper()

def escape\_cpp\_string(s: str) -> List\[str\]:
 r"""
 Convert \*s\* into one or more C++ string literal segments.

 Non-ASCII characters are emitted as \\xNN hex sequences. After each
 hex escape a new segment is started so the compiler doesn't merge
 subsequent hex digits into the escape.

 Returns a list of string segments (without quotes). For simple ASCII
 strings this is a single-element list.
 """
 if not s:
 return \[""\]

 s = s.replace("\\n", "\\\n")

 # Build a flat list of "tokens", where each token is either a regular
 # character sequence or a hex escape. A segment break happens after
 # every hex escape.
 segments: List\[str\] = \[\]
 current: List\[str\] = \[\]
 i = 0

 def \_flush() -> None:
 segments.append("".join(current))
 current.clear()

 while i < len(s):
 ch = s\[i\]

 if ch == "\\\" and i + 1 < len(s):
 nxt = s\[i + 1\]
 if nxt in "ntr\\"\\\":
 current.append(ch + nxt)
 i += 2
 elif nxt == "x" and i + 3 < len(s):
 current.append(s\[i : i + 4\])
 \_flush() # segment break after hex
 i += 4
 else:
 current.append("\\\\\\")
 i += 1
 elif ch == '"':
 current.append('\\\"')
 i += 1
 elif ord(ch) < 128:
 current.append(ch)
 i += 1
 else:
 for byte in ch.encode("utf-8"):
 current.append(f"\\\x{byte:02X}")
 \_flush() # segment break after hex
 i += 1

 # Flush remaining content
 \_flush()

 return segments

def format\_cpp\_string\_literal(segments: List\[str\], indent: str = " ") -> List\[str\]:
 """
 Format string segments (from escape\_cpp\_string) as indented C++ string
 literal lines, each wrapped in quotes.
 Also wraps long segments to respect ~120 column limit.
 """
 # Effective limit for content: 120 - 4 (indent) - 2 (quotes) - 1 (comma/safety) = 113
 # Using 113 to match clang-format exactly (120 - 4 - 2 - 1)
 MAX\_CONTENT\_LEN = 113

 lines: List\[str\] = \[\]

 for seg in segments:
 # Short segment (e.g. hex escape or short text)
 if len(seg) <= MAX\_CONTENT\_LEN:
 lines.append(f'{indent}"{seg}"')
 continue

 # Long segment - wrap it
 current = seg
 while len(current) > MAX\_CONTENT\_LEN:
 # Find best split point
 # Scan forward to find last space <= MAX\_CONTENT\_LEN
 last\_space = -1
 idx = 0
 while idx <= MAX\_CONTENT\_LEN and idx < len(current):
 if current\[idx\] == ' ':
 last\_space = idx

 # Handle escapes to step correctly
 if current\[idx\] == '\\\':
 idx += 2
 else:
 idx += 1

 # If we found a space, split after it
 if last\_space != -1:
 # Include the space in the first line
 split\_point = last\_space + 1
 lines.append(f'{indent}"{current\[:split\_point\]}"')
 current = current\[split\_point:\]
 else:
 # No space, forced break at MAX\_CONTENT\_LEN (or slightly less)
 cut\_at = MAX\_CONTENT\_LEN
 # Don't cut in the middle of an escape sequence
 if current\[cut\_at - 1\] == '\\\':
 cut\_at -= 1

 lines.append(f'{indent}"{current\[:cut\_at\]}"')
 current = current\[cut\_at:\]

 if current:
 lines.append(f'{indent}"{current}"')

 return lines

\# ---------------------------------------------------------------------------
\# Character-set computation
\# ---------------------------------------------------------------------------

def compute\_character\_set(translations: Dict\[str, List\[str\]\], lang\_index: int) -> str:
 """Return a sorted string of every unique character used in a language."""
 chars = set()
 for values in translations.values():
 for ch in values\[lang\_index\]:
 chars.add(ord(ch))
 return "".join(chr(cp) for cp in sorted(chars))

\# ---------------------------------------------------------------------------
\# Code generators
\# ---------------------------------------------------------------------------

def generate\_keys\_header(
 languages: List\[str\],
 language\_names: List\[str\],
 string\_keys: List\[str\],
 output\_path: str,
) -\> None:
 """Generate I18nKeys.h."""
 lines: List\[str\] = \[\
 "#pragma once",\
 "#include ",\
 "",\
 "// THIS FILE IS AUTO-GENERATED BY gen\_i18n.py. DO NOT EDIT.",\
 "",\
 "// Forward declaration for string arrays",\
 "namespace i18n\_strings {",\
 \]

 for code, name in zip(languages, language\_names):
 abbrev = get\_lang\_abbreviation(code, name)
 lines.append(f"extern const char\* const STRINGS\_{abbrev}\[\];")

 lines.append("} // namespace i18n\_strings")
 lines.append("")

 # Language enum
 lines.append("// Language enum")
 lines.append("enum class Language : uint8\_t {")
 for i, lang in enumerate(languages):
 lines.append(f" {lang} = {i},")
 lines.append(" \_COUNT")
 lines.append("};")
 lines.append("")

 # Extern declarations
 lines.append("// Language display names (defined in I18nStrings.cpp)")
 lines.append("extern const char\* const LANGUAGE\_NAMES\[\];")
 lines.append("")
 lines.append("// Character sets for each language (defined in I18nStrings.cpp)")
 lines.append("extern const char\* const CHARACTER\_SETS\[\];")
 lines.append("")

 # StrId enum
 lines.append("// String IDs")
 lines.append("enum class StrId : uint16\_t {")
 for key in string\_keys:
 lines.append(f" {key},")
 lines.append(" // Sentinel - must be last")
 lines.append(" \_COUNT")
 lines.append("};")
 lines.append("")

 # getStringArray helper
 lines.append("// Helper function to get string array for a language")
 lines.append("inline const char\* const\* getStringArray(Language lang) {")
 lines.append(" switch (lang) {")
 for code, name in zip(languages, language\_names):
 abbrev = get\_lang\_abbreviation(code, name)
 lines.append(f" case Language::{code}:")
 lines.append(f" return i18n\_strings::STRINGS\_{abbrev};")
 first\_abbrev = get\_lang\_abbreviation(languages\[0\], language\_names\[0\])
 lines.append(" default:")
 lines.append(f" return i18n\_strings::STRINGS\_{first\_abbrev};")
 lines.append(" }")
 lines.append("}")
 lines.append("")

 # getLanguageCount helper (single line to match checked-in format)
 lines.append("// Helper function to get language count")
 lines.append(
 "constexpr uint8\_t getLanguageCount() "
 "{ return static\_cast(Language::\_COUNT); }"
 )
 lines.append("")

 # Sorted language indices for display order
 # (English first, then by language code alphabetically)
 english\_idx = languages.index("EN")
 rest = sorted(
 (i for i in range(len(languages)) if i != english\_idx),
 key=lambda i: languages\[i\],
 )
 sorted\_indices = \[english\_idx\] + rest
 comment\_names = ", ".join(language\_names\[i\] for i in sorted\_indices)
 lines.append("// Sorted language indices by code (auto-generated by gen\_i18n.py)")
 lines.append(f"// Order: {comment\_names}")
 lines.append(
 "constexpr uint8\_t SORTED\_LANGUAGE\_INDICES\[\] = {"
 f"{', '.join(str(i) for i in sorted\_indices)}"
 "};"
 )
 lines.append("")
 lines.append(
 "static\_assert(sizeof(SORTED\_LANGUAGE\_INDICES) / sizeof(SORTED\_LANGUAGE\_INDICES\[0\]) == getLanguageCount(),"
 )
 lines.append(
 ' "SORTED\_LANGUAGE\_INDICES size mismatch");'
 )

 \_write\_file(output\_path, lines)

def generate\_strings\_header(
 languages: List\[str\],
 language\_names: List\[str\],
 output\_path: str,
) -\> None:
 """Generate I18nStrings.h."""
 lines: List\[str\] = \[\
 "#pragma once",\
 '#include ',\
 "",\
 '#include "I18nKeys.h"',\
 "",\
 "// THIS FILE IS AUTO-GENERATED BY gen\_i18n.py. DO NOT EDIT.",\
 "",\
 "namespace i18n\_strings {",\
 "",\
 \]

 for code, name in zip(languages, language\_names):
 abbrev = get\_lang\_abbreviation(code, name)
 lines.append(f"extern const char\* const STRINGS\_{abbrev}\[\];")

 lines.append("")
 lines.append("} // namespace i18n\_strings")
 \_write\_file(output\_path, lines)

def generate\_strings\_cpp(
 languages: List\[str\],
 language\_names: List\[str\],
 string\_keys: List\[str\],
 translations: Dict\[str, List\[str\]\],
 output\_path: str,
) -\> None:
 """Generate I18nStrings.cpp."""
 lines: List\[str\] = \[\
 '#include "I18nStrings.h"',\
 "",\
 "// THIS FILE IS AUTO-GENERATED BY gen\_i18n.py. DO NOT EDIT.",\
 "",\
 \]

 # LANGUAGE\_NAMES array
 lines.append("// Language display names")
 lines.append("const char\* const LANGUAGE\_NAMES\[\] = {")
 for name in language\_names:
 \_append\_string\_entry(lines, name)
 lines.append("};")
 lines.append("")

 # CHARACTER\_SETS array
 lines.append("// Character sets for each language")
 lines.append("const char\* const CHARACTER\_SETS\[\] = {")
 for lang\_idx, name in enumerate(language\_names):
 charset = compute\_character\_set(translations, lang\_idx)
 \_append\_string\_entry(lines, charset, comment=name)
 lines.append("};")
 lines.append("")

 # Per-language string arrays
 lines.append("namespace i18n\_strings {")
 lines.append("")

 for lang\_idx, (code, name) in enumerate(zip(languages, language\_names)):
 abbrev = get\_lang\_abbreviation(code, name)
 lines.append(f"const char\* const STRINGS\_{abbrev}\[\] = {{")

 for key in string\_keys:
 text = translations\[key\]\[lang\_idx\]
 \_append\_string\_entry(lines, text)

 lines.append("};")
 lines.append("")

 lines.append("} // namespace i18n\_strings")
 lines.append("")

 # Compile-time size checks
 lines.append("// Compile-time validation of array sizes")
 for code, name in zip(languages, language\_names):
 abbrev = get\_lang\_abbreviation(code, name)
 lines.append(
 f"static\_assert(sizeof(i18n\_strings::STRINGS\_{abbrev}) "
 f"/ sizeof(i18n\_strings::STRINGS\_{abbrev}\[0\]) =="
 )
 lines.append(" static\_cast(StrId::\_COUNT),")
 lines.append(f' "STRINGS\_{abbrev} size mismatch");')

 \_write\_file(output\_path, lines)

\# ---------------------------------------------------------------------------
\# Helpers
\# ---------------------------------------------------------------------------

def \_append\_string\_entry(
 lines: List\[str\], text: str, comment: str = ""
) -\> None:
 """Escape \*text\*, format as indented C++ lines, append comma (and optional comment)."""
 segments = escape\_cpp\_string(text)
 formatted = format\_cpp\_string\_literal(segments)
 suffix = f", // {comment}" if comment else ","
 formatted\[-1\] += suffix
 lines.extend(formatted)

def \_write\_file(path: str, lines: List\[str\]) -> None:
 with open(path, "w", encoding="utf-8", newline="\\n") as f:
 f.write("\\n".join(lines))
 f.write("\\n")
 print(f"Generated: {path}")

\# ---------------------------------------------------------------------------
\# Main
\# ---------------------------------------------------------------------------

def main(translations\_dir=None, output\_dir=None) -> None:
 # Default paths (relative to project root)
 default\_translations\_dir = "lib/I18n/translations"
 default\_output\_dir = "lib/I18n/"

 if translations\_dir is None or output\_dir is None:
 if len(sys.argv) == 3:
 translations\_dir = sys.argv\[1\]
 output\_dir = sys.argv\[2\]
 else:
 # Default for no arguments or weird arguments (e.g. SCons)
 translations\_dir = default\_translations\_dir
 output\_dir = default\_output\_dir

 if not os.path.isdir(translations\_dir):
 print(f"Error: Translations directory not found: {translations\_dir}")
 sys.exit(1)

 if not os.path.isdir(output\_dir):
 print(f"Error: Output directory not found: {output\_dir}")
 sys.exit(1)

 print(f"Reading translations from: {translations\_dir}")
 print(f"Output directory: {output\_dir}")
 print()

 try:
 languages, language\_names, string\_keys, translations = load\_translations(
 translations\_dir
 )

 out = Path(output\_dir)
 generate\_keys\_header(languages, language\_names, string\_keys, str(out / "I18nKeys.h"))
 generate\_strings\_header(languages, language\_names, str(out / "I18nStrings.h"))
 generate\_strings\_cpp(
 languages, language\_names, string\_keys, translations, str(out / "I18nStrings.cpp")
 )

 print()
 print("✓ Code generation complete!")
 print(f" Languages: {len(languages)}")
 print(f" String keys: {len(string\_keys)}")

 except Exception as e:
 print(f"\\nError: {e}")
 sys.exit(1)

if \_\_name\_\_ == "\_\_main\_\_":
 main()
else:
 try:
 Import("env")
 print("Running i18n generation script from PlatformIO...")
 main()
 except NameError:
 pass