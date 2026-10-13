#!/bin/sh
# Modu derler: mod/kole-komut.jar. JDK 25 gerekir: JDK=<jdk klasörü> sh derle.sh
set -e
cd "$(dirname "$0")"
SUNUCU=../server
CP="$SUNUCU/versions/26.1/server-26.1.jar$(find $SUNUCU/libraries -name '*.jar' -printf ';%p')"
rm -rf sinif && mkdir sinif
"$JDK/bin/javac" -proc:none --release 25 -nowarn -cp "$CP" -d sinif $(find src -name '*.java')
cp kaynak/* sinif/
"$JDK/bin/jar" --create --file kole-komut.jar -C sinif .
rm -rf sinif
echo "hazır: mod/kole-komut.jar"
