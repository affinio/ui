<?php

namespace Affino\Listbox\Laravel\View\Components;

use Illuminate\View\Component;
use Illuminate\View\View;

class ListboxOption extends Component
{
    public string $value;

    public bool $disabled;

    public bool $selected;

    public ?string $label;

    public function __construct(string $value, bool $disabled = false, bool $selected = false, ?string $label = null)
    {
        $this->value = $value;
        $this->disabled = $disabled;
        $this->selected = $selected;
        $this->label = $label;
    }

    public function render(): View
    {
        return view('listbox-laravel::livewire.option');
    }
}
