<?php

namespace Affino\Tooltip\Laravel\View\Components;

use Affino\Tooltip\Laravel\Support\TriggerMode;
use Illuminate\Support\Str;
use Illuminate\View\Component;
use Illuminate\View\View;

class Tooltip extends Component
{
    public string $tooltipId;

    public int $openDelay;

    public int $closeDelay;

    public string $placement;

    public string $align;

    public int $gutter;

    public string $strategy;

    public string $triggerMode;

    public function __construct(
        ?string $tooltipId = null,
        int $openDelay = 80,
        int $closeDelay = 150,
        string $placement = 'top',
        string $align = 'center',
        int $gutter = 8,
        string $strategy = 'fixed',
        string $trigger = TriggerMode::DEFAULT
    ) {
        $this->tooltipId = $tooltipId ?: 'affino-tooltip-' . Str::uuid();
        $this->openDelay = $openDelay;
        $this->closeDelay = $closeDelay;
        $this->placement = $placement;
        $this->align = $align;
        $this->gutter = $gutter;
        $this->strategy = $strategy;
        $this->triggerMode = TriggerMode::normalize($trigger);
    }

    public function render(): View
    {
        return view('tooltip-laravel::livewire.tooltip');
    }
}
