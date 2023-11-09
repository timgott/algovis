# NixOS 23.05
{ pkgs ? import <nixpkgs> {} }:
let
  nodePkgs = pkgs.nodePackages;
in
pkgs.mkShell {
  packages = [ pkgs.nodejs_20 nodePkgs.typescript-language-server ];
}
