<?php

namespace Affino\Popover\Laravel\Livewire;

use Illuminate\Support\Str;
use Livewire\Component;

class Popover extends Component
{
    public string $popoverId;

    public string $placement = 'bottom';

    public string $align = 'center';

    public int $gutter = 12;

    public int $viewportPadding = 20;

    public string $strategy = 'fixed';

    public string $role = 'dialog';

    public bool $modal = false;

    public bool $closeOnEscape = true;

    public bool $closeOnInteractOutside = true;

    public bool $returnFocus = true;

    public bool $lockScroll = false;

    public bool $defaultOpen = false;

    public bool $pinned = false;

    public int $arrowSize = 12;

    public int $arrowInset = 6;

    public int $arrowOffset = 6;

    public function mount(?string $popoverId = null): void
    {
        $this->popoverId = $popoverId ?: 'affino-popover-' . Str::uuid();
    }

    public function render(): string
    {
        return view('popover-laravel::livewire.popover');
    }
}
