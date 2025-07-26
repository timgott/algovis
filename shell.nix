# NixOS 23.05
{ pkgs ? import <nixpkgs> {} }:
let
  nodePkgs = pkgs.nodePackages;
in
pkgs.mkShell {
  packages = [ pkgs.nodejs_24 nodePkgs.typescript-language-server pkgs.deno ];
}
