<?php

namespace Affino\Tooltip\Laravel\Livewire;

use Affino\Tooltip\Laravel\Support\TriggerMode;
use Illuminate\Support\Str;
use Livewire\Component;

class Tooltip extends Component
{
    public string $tooltipId;

    public int $openDelay = 80;

    public int $closeDelay = 150;

    public string $placement = 'top';

    public string $align = 'center';

    public int $gutter = 8;

    public string $strategy = 'fixed';

    public string $triggerMode = TriggerMode::DEFAULT;

    public function mount(?string $tooltipId = null, string $trigger = TriggerMode::DEFAULT): void
    {
        $this->tooltipId = $tooltipId ?: 'affino-tooltip-' . Str::uuid();
        $this->triggerMode = TriggerMode::normalize($trigger);
    }

    public function render(): string
    {
        return view('tooltip-laravel::livewire.tooltip');
    }
}
