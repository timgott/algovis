# NixOS 23.05
{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs_24 pkgs.typescript-language-server pkgs.deno ];
}
