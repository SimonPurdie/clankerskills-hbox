#!/bin/sh
set -eu

operation=$1
target=$2
sync_id=$3
parent=$(dirname "$target")
stage="$parent/.clankerskills-$sync_id-stage"
backup="$parent/.clankerskills-$sync_id-backup"

move_children() {
  source=$1
  destination=$2
  [ -d "$source" ] || return 0
  mkdir -p "$destination"
  find "$source" -mindepth 1 -maxdepth 1 -exec mv -t "$destination" -- {} +
}

clear_children() {
  directory=$1
  [ -d "$directory" ] || return 0
  find "$directory" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
}

case "$operation" in
  prepare)
    repository=$4
    shift 4
    mkdir -p "$parent" "$target"
    rm -rf -- "$stage" "$backup"
    mkdir "$stage"
    while [ "$#" -gt 0 ]; do
      [ "$#" -ge 2 ] || { echo "Incomplete skill mapping" >&2; exit 2; }
      source_relative=$1
      destination_name=$2
      shift 2
      case "$source_relative" in /*|*../*|../*|*/..) echo "Unsafe source path" >&2; exit 2;; esac
      case "$destination_name" in ''|*/*|.|..) echo "Unsafe destination name" >&2; exit 2;; esac
      cp -a -- "$repository/$source_relative" "$stage/$destination_name"
    done
    ;;
  commit)
    mkdir "$backup"
    move_children "$target" "$backup"
    move_children "$stage" "$target"
    ;;
  rollback)
    [ -d "$backup" ] || exit 0
    mkdir -p "$target"
    clear_children "$target"
    move_children "$backup" "$target"
    rm -rf -- "$backup"
    ;;
  cleanup)
    rm -rf -- "$stage" "$backup"
    ;;
  *)
    echo "Unknown operation: $operation" >&2
    exit 2
    ;;
esac
