set -eu

APP_DIR="/volume1/docker/react-app"
ARCHIVE="/volume1/docker/react-app/dist.tar.gz"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT=".deploy-backup"
BACKUP_DIR="$BACKUP_ROOT/xftech-$STAMP"
RELEASE_DIR=".deploy-release-$STAMP"
RELEASE_LIST=".deploy-release-items-$STAMP"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR" "$RELEASE_DIR"

for item in index.html assets nginx.conf; do
  if [ -e "$item" ]; then
    cp -a "$item" "$BACKUP_DIR/"
  fi
done

restore_backup() {
  if [ -f "$RELEASE_LIST" ]; then
    ITEMS=$(cat "$RELEASE_LIST")
  else
    ITEMS="index.html assets nginx.conf"
  fi

  for item in $ITEMS; do
    rm -rf "$item"
    if [ -e "$BACKUP_DIR/$item" ]; then
      cp -a "$BACKUP_DIR/$item" .
    fi
  done
}

if ! tar -xzf "$ARCHIVE" -C "$RELEASE_DIR"; then
  restore_backup
  rm -rf "$RELEASE_DIR"
  echo "Deploy failed while extracting archive. Previous files were restored." >&2
  exit 1
fi

find "$RELEASE_DIR" -mindepth 1 -maxdepth 1 -exec basename {} \; > "$RELEASE_LIST"

for name in $(cat "$RELEASE_LIST"); do
  rm -rf "$name"
  if ! mv "$RELEASE_DIR/$name" .; then
    restore_backup
    rm -rf "$RELEASE_DIR"
    rm -f "$RELEASE_LIST"
    echo "Deploy failed while moving release files. Previous files were restored." >&2
    exit 1
  fi
done

rm -rf "$RELEASE_DIR"
rm -f "$RELEASE_LIST"
rm -f "$ARCHIVE"
rm -f "/volume1/docker/react-app/.deploy-remote.sh"



echo "Deploy finished. Backup saved to: $APP_DIR/$BACKUP_DIR"
