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

      chromeLibs = with pkgs; [
        glib
        nspr
        nss
        atk
        at-spi2-atk
        at-spi2-core
        dbus
        cups
        expat
        libxcb
        libxkbcommon
        alsa-lib
        libgbm
        cairo
        pango
        libdrm
        libx11
        libxext
        libxcomposite
        libxdamage
        libxfixes
        libxrandr
        libxrender
        libxscrnsaver
        libxi
        libxcursor
        libxtst
        libpulseaudio
        udev
        libGL
        fontconfig
        freetype
        pipewire
      ];

      chromeLdPath = pkgs.lib.makeLibraryPath chromeLibs;
    in {
      packages.agent-browser = pkgs.agent-browser;

      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs_26
          agent-browser
          python3
        ];

        shellHook = ''
          echo "🚲 MyBike dev environment"
          export NIX_LD_LIBRARY_PATH="${chromeLdPath}''${NIX_LD_LIBRARY_PATH:+:$NIX_LD_LIBRARY_PATH}"
          export LD_LIBRARY_PATH="${chromeLdPath}''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
        '';
      };
    });
}