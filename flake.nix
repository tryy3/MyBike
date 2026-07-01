{
  description = "MyBike development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [
          (final: prev: {
            agent-browser = final.callPackage ./nix/agent-browser/package.nix { };
          })
        ];
      };
    in {
      packages.agent-browser = pkgs.agent-browser;

      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs_26
          agent-browser
        ];

        shellHook = ''
          echo "🚲 MyBike dev environment"
        '';
      };
    });
}
