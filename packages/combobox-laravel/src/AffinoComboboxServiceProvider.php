<?php

namespace Affino\Combobox\Laravel;

use Affino\Combobox\Laravel\View\Components\Combobox;
use Affino\Combobox\Laravel\View\Components\ComboboxOption;
use Illuminate\Support\Facades\Blade;
use Illuminate\Support\ServiceProvider;

class AffinoComboboxServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadViewsFrom(__DIR__ . '/../resources/views', 'combobox-laravel');

        Blade::component('affino-combobox', Combobox::class);
        Blade::component('affino-combobox-option', ComboboxOption::class);
        Blade::component('affino-combobox.option', ComboboxOption::class);

        $this->publishes([
            __DIR__ . '/../resources/views' => resource_path('views/vendor/combobox-laravel'),
        ], 'affino-combobox-laravel-views');

        $this->publishes([
            __DIR__ . '/../resources/js' => resource_path('vendor/combobox-laravel/js'),
            __DIR__ . '/../dist' => resource_path('vendor/combobox-laravel/dist'),
        ], 'affino-combobox-laravel-assets');
    }
}
