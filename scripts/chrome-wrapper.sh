#!/bin/bash
# Wrapper for Google Chrome in LiveKit Egress container
# Fixes Chrome 136+ requirement: DevTools remote debugging requires a non-default data directory.

export CHROME_WRAPPER="`readlink -f "$0"`"
HERE="`dirname "$CHROME_WRAPPER"`"
[ -x "$HERE/chrome" ] || HERE="/opt/google/chrome"

xdg_app_dir="${XDG_DATA_HOME:-$HOME/.local/share/applications}"
mkdir -p "$xdg_app_dir"
[ -f "$xdg_app_dir/mimeapps.list" ] || touch "$xdg_app_dir/mimeapps.list"

export CHROME_VERSION_EXTRA="stable"
export GNOME_DISABLE_CRASH_DIALOG=SET_BY_GOOGLE_CHROME
export PULSE_SERVER="${PULSE_SERVER:-unix:/home/egress/.cache/xdgr/pulse/native}"

exec < /dev/null
exec > >(exec cat)
exec 2> >(exec cat >&2)

has_user_data_dir=false
for arg in "$@"; do
  if [[ "$arg" == --user-data-dir* ]]; then
    has_user_data_dir=true
    break
  fi
done

if [ "$has_user_data_dir" = false ]; then
  CHROME_TEMP_PROFILE=$(mktemp -d /tmp/chrome-profile-XXXXXX)
  set -- --user-data-dir="$CHROME_TEMP_PROFILE" "$@"
fi

exec -a "$0" "$HERE/chrome" "$@"

