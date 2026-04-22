\[platformio\]
default\_envs = default
extra\_configs = platformio.local.ini

\[crosspoint\]
version = 1.2.0

\[base\]
platform = https://github.com/pioarduino/platform-espressif32/releases/download/55.03.37/platform-espressif32.zip
board = esp32-c3-devkitm-1
framework = arduino
monitor\_speed = 115200
upload\_speed = 921600
check\_tool = cppcheck
check\_flags = --enable=all --suppress=missingIncludeSystem --suppress=unusedFunction --suppress=unmatchedSuppression --suppress=\*:\*/.pio/\* --inline-suppr
check\_skip\_packages = yes

board\_upload.flash\_size = 16MB
board\_upload.maximum\_size = 16777216
board\_upload.offset\_address = 0x10000

build\_flags =
 -DARDUINO\_USB\_MODE=1
 -DARDUINO\_USB\_CDC\_ON\_BOOT=1
 -DEINK\_DISPLAY\_SINGLE\_BUFFER\_MODE=1
 -DDISABLE\_FS\_H\_WARNING=1
 -DDESTRUCTOR\_CLOSES\_FILE=1
\# https://libexpat.github.io/doc/api/latest/#XML\_GE
 -DXML\_GE=0
 -DXML\_CONTEXT\_BYTES=1024
 -std=gnu++2a
\# Enable UTF-8 long file names in SdFat
 -DUSE\_UTF8\_LONG\_NAMES=1
\# Increase PNG scanline buffer to support up to 2048px wide images
\# Default is (320\*4+1)\*2=2562, we need more for larger images
 -DPNG\_MAX\_BUFFERED\_PIXELS=16416
 -Wno-bidi-chars
 -Wl,--wrap=panic\_print\_backtrace,--wrap=panic\_abort
 -fno-exceptions

build\_unflags =
 -std=gnu++11
 -fexceptions

; Board configuration
board\_build.flash\_mode = dio
board\_build.flash\_size = 16MB
board\_build.partitions = partitions.csv

extra\_scripts =
 pre:scripts/build\_html.py
 pre:scripts/gen\_i18n.py
 pre:scripts/git\_branch.py
 pre:scripts/patch\_jpegdec.py

; Libraries
lib\_deps =
 BatteryMonitor=symlink://open-x4-sdk/libs/hardware/BatteryMonitor
 InputManager=symlink://open-x4-sdk/libs/hardware/InputManager
 EInkDisplay=symlink://open-x4-sdk/libs/display/EInkDisplay
 SDCardManager=symlink://open-x4-sdk/libs/hardware/SDCardManager
 bblanchon/ArduinoJson @ 7.4.2
 ricmoo/QRCode @ 0.0.1
 bitbank2/PNGdec @ ^1.0.0
 https://github.com/bitbank2/JPEGDEC.git#86282979224c8a32fd51e091ed5a35b0c699a52b
 links2004/WebSockets @ 2.7.3

\[env:default\]
extends = base
build\_flags =
 ${base.build\_flags}
 ; CROSSPOINT\_VERSION is set by scripts/git\_branch.py (includes current branch)
 -DENABLE\_SERIAL\_LOG
 -DLOG\_LEVEL=2 ; Set log level to debug for development builds

\[env:gh\_release\]
extends = base
build\_flags =
 ${base.build\_flags}
 -DCROSSPOINT\_VERSION=\\"${crosspoint.version}\\"
 -DENABLE\_SERIAL\_LOG
 -DLOG\_LEVEL=1 ; Set log level to info for release builds

\[env:gh\_release\_rc\]
extends = base
build\_flags =
 ${base.build\_flags}
 -DCROSSPOINT\_VERSION=\\"${crosspoint.version}-rc+${sysenv.CROSSPOINT\_RC\_HASH}\\"
 -DENABLE\_SERIAL\_LOG
 -DLOG\_LEVEL=1 ; Set log level to info for release candidate builds

\[env:slim\]
extends = base
build\_flags =
 ${base.build\_flags}
 -DCROSSPOINT\_VERSION=\\"${crosspoint.version}-slim\\"
 ; serial output is disabled in slim builds to save space
 -UENABLE\_SERIAL\_LOG