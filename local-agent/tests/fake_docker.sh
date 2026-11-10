#!/bin/sh
# shim `docker` untuk uji: "info" -> versi; "run ..." -> tulis job.out di dir yang di-mount; "kill" -> exit 0
case "$1" in
 info) echo "99.0-fake"; exit 0;;
 kill) exit 0;;
 run)
  shift; vol=""; 
  while [ $# -gt 0 ]; do case "$1" in -v) vol="$2"; shift;; esac; shift; done
  dir="${vol%%:*}"; sleep 1
  printf 'FINAL SINGLE POINT ENERGY       -1.000000000000\n                             ****ORCA TERMINATED NORMALLY****\n' > "$dir/job.out"
  echo fakeblob > "$dir/job.gbw"; exit 0;;
esac
