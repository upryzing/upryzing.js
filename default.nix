{
  pkgs ? import <nixpkgs> { },
}:

with pkgs;
pkgs.mkShell {
  name = "upryzingEnv";

  buildInputs = [
    # Tools
    git
    gh
    deno

    # Node
    nodejs
    nodejs.pkgs.pnpm
  ];
}
