# NixOS 23.05
{ pkgs ? import <nixpkgs> {} }:
let
  nodePkgs = pkgs.nodePackages;
in
pkgs.mkShell {
  packages = [ nodePkgs.typescript nodePkgs.typescript-language-server ];
}
