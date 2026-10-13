package kole;

import com.mojang.brigadier.CommandDispatcher;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.server.permissions.LevelBasedPermissionSet;

// /kole <alt>: herkes yazabilir, işi bot'un ürettiği veri paketindeki "kole:<alt>" fonksiyonu yapar
// (kimin köleyi çağırabileceğine bot karar verir). Mod sadece komutu oyuna tanıtır.
public final class KoleKomut {
  private KoleKomut() {}

  public static void kaydet(CommandDispatcher<CommandSourceStack> d) {
    d.register(Commands.literal("kole")
        .then(Commands.literal("cagir").executes(c -> fonksiyon(c.getSource(), "cagir")))
        .then(Commands.literal("menu").executes(c -> fonksiyon(c.getSource(), "menu_ac"))));
  }

  // withPermission: oyuncunun yetkisini fonksiyon için 2ye çıkarır (withMaximumPermission sadece tavan koyar, function reddedilirdi)
  private static int fonksiyon(CommandSourceStack kaynak, String ad) {
    CommandSourceStack yetkili = kaynak.withSuppressedOutput().withPermission(LevelBasedPermissionSet.GAMEMASTER);
    kaynak.getServer().getCommands().performPrefixedCommand(yetkili, "function kole:" + ad);
    return 1;
  }
}
