# NixOS 23.05
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodePackages.typescript ];
}
