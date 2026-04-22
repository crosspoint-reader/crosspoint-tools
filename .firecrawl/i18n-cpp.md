#include "I18n.h"

#include
#include
#include

#include "I18nStrings.h"

using namespace i18n\_strings;

// Settings file path
static constexpr const char\* SETTINGS\_FILE = "/.crosspoint/language.bin";
static constexpr uint8\_t SETTINGS\_VERSION = 1;

I18n& I18n::getInstance() {
 static I18n instance;
 return instance;
}

const char\* I18n::get(StrId id) const {
 const auto index = static\_cast(id);
 if (index >= static\_cast(StrId::\_COUNT)) {
 return "???";
 }

 // Use generated helper function - no hardcoded switch needed!
 const char\* const\* strings = getStringArray(\_language);
 return strings\[index\];
}

void I18n::setLanguage(Language lang) {
 if (lang >= Language::\_COUNT) {
 return;
 }
 \_language = lang;
 saveSettings();
}

const char\* I18n::getLanguageName(Language lang) const {
 const auto index = static\_cast(lang);
 if (index >= static\_cast(Language::\_COUNT)) {
 return "???";
 }
 return LANGUAGE\_NAMES\[index\];
}

void I18n::saveSettings() {
 Storage.mkdir("/.crosspoint");

 FsFile file;
 if (!Storage.openFileForWrite("I18N", SETTINGS\_FILE, file)) {
 Serial.printf("\[I18N\] Failed to save settings\\n");
 return;
 }

 serialization::writePod(file, SETTINGS\_VERSION);
 serialization::writePod(file, static\_cast(\_language));

 file.close();
 Serial.printf("\[I18N\] Settings saved: language=%d\\n", static\_cast(\_language));
}

void I18n::loadSettings() {
 FsFile file;
 if (!Storage.openFileForRead("I18N", SETTINGS\_FILE, file)) {
 Serial.printf("\[I18N\] No settings file, using default (English)\\n");
 return;
 }

 uint8\_t version;
 serialization::readPod(file, version);
 if (version != SETTINGS\_VERSION) {
 Serial.printf("\[I18N\] Settings version mismatch\\n");
 return;
 }

 uint8\_t lang;
 serialization::readPod(file, lang);
 if (lang < static\_cast(Language::\_COUNT)) {
 \_language = static\_cast(lang);
 Serial.printf("\[I18N\] Loaded language: %d\\n", static\_cast(\_language));
 }
}

// Generate character set for a specific language
const char\* I18n::getCharacterSet(Language lang) {
 const auto langIndex = static\_cast(lang);
 if (langIndex >= static\_cast(Language::\_COUNT)) {
 lang = Language::EN; // Fallback to first language
 }

 return CHARACTER\_SETS\[static\_cast(lang)\];
}