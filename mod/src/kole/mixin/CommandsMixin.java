package kole.mixin;

import kole.KoleKomut;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.Commands;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// Fabric API olmadan komut kaydı: vanilla komutlar kurulunca /kole'yi de ekle (her /reload'da yeniden kurulur)
@Mixin(Commands.class)
public abstract class CommandsMixin {
  @Inject(method = "<init>", at = @At("RETURN"))
  private void kole$kaydet(Commands.CommandSelection secim, CommandBuildContext baglam, CallbackInfo ci) {
    KoleKomut.kaydet(((Commands) (Object) this).getDispatcher());
  }
}
